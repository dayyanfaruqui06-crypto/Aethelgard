"""Inference pipeline: prompt → tokenize → generate → decode → cleanup.

Exposes two entry points:
  * generate_once(messages, ...)       — non-streaming, returns the full string
  * generate_stream(messages, ...)     — async generator yielding token chunks

A global asyncio.Lock serializes generations so two requests cannot collide
in VRAM. CUDA cache is emptied after every call.
"""
from __future__ import annotations

import asyncio
import gc
import logging
import threading
import time
from typing import AsyncIterator, List, Optional

import torch

from config import settings
from model import get_model, get_tokenizer
from prompt_builder import build_prompt, normalize, truncate_to_context
from utils.formatting import sanitize

logger = logging.getLogger(__name__)

# Serialize generation across concurrent requests.
_generation_lock = asyncio.Lock()

# ── Default generation parameters (matched to script.py) ─────────────────────
DEFAULT_MAX_NEW_TOKENS   = 1200
DEFAULT_TEMPERATURE      = 0.3
DEFAULT_TOP_P            = 0.85
DEFAULT_TOP_K            = 50
DEFAULT_REPETITION_PENALTY = 1.15


def _cleanup_gpu() -> None:
    try:
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
    except Exception:
        pass


def _build_generation_kwargs(
    input_ids,
    attention_mask,
    tokenizer,
    *,
    max_new_tokens: int,
    temperature: float,
    top_p: float,
    top_k: int,
    repetition_penalty: float,
) -> dict:
    eos_ids = []
    if tokenizer.eos_token_id is not None:
        eos_ids.append(tokenizer.eos_token_id)

    # Qwen / DeepSeek-R1 stop tokens
    for token in ("<|im_end|>", "<|im_start|>"):
        tid = tokenizer.convert_tokens_to_ids(token)
        if isinstance(tid, int) and tid >= 0 and tid not in eos_ids:
            eos_ids.append(tid)

    return {
        "input_ids": input_ids,
        "attention_mask": attention_mask,
        "max_new_tokens": max_new_tokens,
        "do_sample": temperature > 0,
        "temperature": max(temperature, 1e-5),
        "top_p": top_p,
        "top_k": top_k,
        "repetition_penalty": repetition_penalty,
        "pad_token_id": tokenizer.pad_token_id,
        "eos_token_id": eos_ids or tokenizer.eos_token_id,
    }


def _resolve(value, setting_value, default):
    """Return the first non-None value: caller → config → hardcoded default."""
    if value is not None:
        return value
    if setting_value is not None:
        return setting_value
    return default


def _prepare_inputs(messages: List[dict]):
    tokenizer = get_tokenizer()
    model = get_model()

    msgs = truncate_to_context(tokenizer, normalize(messages), settings.context_window_tokens)
    prompt = build_prompt(tokenizer, msgs)
    inputs = tokenizer(prompt, return_tensors="pt")
    device = next(model.parameters()).device
    input_ids = inputs["input_ids"].to(device)
    attention_mask = inputs.get("attention_mask")
    if attention_mask is not None:
        attention_mask = attention_mask.to(device)
    return tokenizer, model, input_ids, attention_mask, prompt


def generate_once(
    messages: List[dict],
    *,
    max_new_tokens: Optional[int] = None,
    temperature: Optional[float] = None,
    top_p: Optional[float] = None,
    top_k: Optional[int] = None,
    repetition_penalty: Optional[float] = None,
) -> str:
    """Blocking single-shot generation. Used for warmup + non-stream endpoint."""
    started = time.perf_counter()
    tokenizer, model, input_ids, attention_mask, _prompt = _prepare_inputs(messages)
    gen_kwargs = _build_generation_kwargs(
        input_ids,
        attention_mask,
        tokenizer,
        max_new_tokens=_resolve(max_new_tokens, getattr(settings, "max_new_tokens", None), DEFAULT_MAX_NEW_TOKENS),
        temperature=_resolve(temperature, getattr(settings, "temperature", None), DEFAULT_TEMPERATURE),
        top_p=_resolve(top_p, getattr(settings, "top_p", None), DEFAULT_TOP_P),
        top_k=_resolve(top_k, getattr(settings, "top_k", None), DEFAULT_TOP_K),
        repetition_penalty=_resolve(repetition_penalty, getattr(settings, "repetition_penalty", None), DEFAULT_REPETITION_PENALTY),
    )
    try:
        with torch.inference_mode():
            output = model.generate(**gen_kwargs)
        generated = output[0, input_ids.shape[-1]:]
        text = tokenizer.decode(generated, skip_special_tokens=True)
        text = sanitize(text)
        dur = time.perf_counter() - started
        n_tokens = int(generated.shape[-1])
        logger.info(
            "generate_once: %d tokens in %.2fs (%.1f tok/s)",
            n_tokens, dur, n_tokens / dur if dur > 0 else 0.0,
        )
        return text
    finally:
        _cleanup_gpu()


async def generate_stream(
    messages: List[dict],
    *,
    max_new_tokens: Optional[int] = None,
    temperature: Optional[float] = None,
    top_p: Optional[float] = None,
    top_k: Optional[int] = None,
    repetition_penalty: Optional[float] = None,
) -> AsyncIterator[str]:
    """Async token streamer. Yields raw text deltas as the model produces them."""
    from transformers import TextIteratorStreamer

    async with _generation_lock:
        try:
            tokenizer, model, input_ids, attention_mask, _prompt = _prepare_inputs(messages)
        except Exception:
            _cleanup_gpu()
            raise

        streamer = TextIteratorStreamer(
            tokenizer, skip_prompt=True, skip_special_tokens=True
        )
        gen_kwargs = _build_generation_kwargs(
            input_ids,
            attention_mask,
            tokenizer,
            max_new_tokens=_resolve(max_new_tokens, getattr(settings, "max_new_tokens", None), DEFAULT_MAX_NEW_TOKENS),
            temperature=_resolve(temperature, getattr(settings, "temperature", None), DEFAULT_TEMPERATURE),
            top_p=_resolve(top_p, getattr(settings, "top_p", None), DEFAULT_TOP_P),
            top_k=_resolve(top_k, getattr(settings, "top_k", None), DEFAULT_TOP_K),
            repetition_penalty=_resolve(repetition_penalty, getattr(settings, "repetition_penalty", None), DEFAULT_REPETITION_PENALTY),
        )
        gen_kwargs["streamer"] = streamer

        started = time.perf_counter()

        def _runner():
            try:
                with torch.inference_mode():
                    model.generate(**gen_kwargs)
            except Exception as exc:
                logger.exception("Generation thread failed: %s", exc)

        thread = threading.Thread(target=_runner, daemon=True)
        thread.start()

        loop = asyncio.get_event_loop()
        timeout = settings.generation_timeout_s
        deadline = started + timeout
        it = iter(streamer)
        sentinel = object()

        try:
            while True:
                remaining = deadline - time.perf_counter()
                if remaining <= 0:
                    logger.warning("Generation timeout after %.1fs", timeout)
                    break

                def _next():
                    try:
                        return next(it)
                    except StopIteration:
                        return sentinel

                try:
                    chunk = await asyncio.wait_for(
                        loop.run_in_executor(None, _next), timeout=remaining
                    )
                except asyncio.TimeoutError:
                    logger.warning("Generation timeout (await) after %.1fs", timeout)
                    break

                if chunk is sentinel:
                    break
                if chunk:
                    yield chunk
        finally:
            thread.join(timeout=1.0)
            _cleanup_gpu()
            dur = time.perf_counter() - started
            logger.info("generate_stream finished in %.2fs", dur)
