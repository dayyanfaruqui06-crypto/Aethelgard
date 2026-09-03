"""Global model loader.

Loads the tokenizer + base model (optionally with a LoRA adapter) ONCE at
process startup. All inference paths import `get_model()` / `get_tokenizer()`.
"""
from __future__ import annotations

import logging
import threading
from typing import Optional, Tuple

import torch

from config import settings

logger = logging.getLogger(__name__)

_lock = threading.Lock()
_tokenizer = None
_model = None


def _resolve_dtype(name: str):
    name = (name or "").lower()
    if name in {"bfloat16", "bf16"}:
        return torch.bfloat16
    if name in {"float16", "fp16", "half"}:
        return torch.float16
    return torch.float32


def load() -> Tuple[object, object]:
    """Load tokenizer + model exactly once. Thread-safe."""
    global _tokenizer, _model
    if _model is not None and _tokenizer is not None:
        return _tokenizer, _model

    with _lock:
        if _model is not None and _tokenizer is not None:
            return _tokenizer, _model

        from transformers import AutoModelForCausalLM, AutoTokenizer

        tok_path = settings.tokenizer_path or settings.model_path
        logger.info("Loading tokenizer from %s", tok_path)
        tokenizer = AutoTokenizer.from_pretrained(tok_path, trust_remote_code=True)

        # Required for batched generation on Qwen-family models
        if tokenizer.pad_token is None:
            tokenizer.pad_token = tokenizer.eos_token
        tokenizer.padding_side = "left"

        load_kwargs: dict = {
            "trust_remote_code": True,
            "device_map": "auto",
        }

        compute_dtype = _resolve_dtype(settings.bnb_4bit_compute_dtype)

        if settings.load_in_4bit and torch.cuda.is_available():
            try:
                from transformers import BitsAndBytesConfig

                load_kwargs["quantization_config"] = BitsAndBytesConfig(
                    load_in_4bit=True,
                    bnb_4bit_quant_type=settings.bnb_4bit_quant_type,
                    bnb_4bit_use_double_quant=settings.bnb_4bit_use_double_quant,
                    bnb_4bit_compute_dtype=compute_dtype,
                )
                logger.info("4-bit quantization enabled (%s).", settings.bnb_4bit_quant_type)
            except Exception as exc:  # pragma: no cover - environment dependent
                logger.warning("bitsandbytes unavailable, falling back to fp16/bf16: %s", exc)
                load_kwargs["torch_dtype"] = compute_dtype
        else:
            load_kwargs["torch_dtype"] = compute_dtype

        logger.info("Loading base model from %s", settings.model_path)
        model = AutoModelForCausalLM.from_pretrained(settings.model_path, **load_kwargs)

        if settings.adapter_path:
            try:
                from peft import PeftModel

                logger.info("Attaching LoRA adapter from %s", settings.adapter_path)
                model = PeftModel.from_pretrained(model, settings.adapter_path)
            except Exception as exc:
                logger.exception("Failed to attach adapter: %s", exc)
                raise

        model.eval()

        # Ensure model knows the pad token id
        try:
            model.config.pad_token_id = tokenizer.pad_token_id
        except Exception:
            pass

        _tokenizer = tokenizer
        _model = model
        logger.info("Model + tokenizer loaded.")
        return _tokenizer, _model


def get_tokenizer():
    if _tokenizer is None:
        load()
    return _tokenizer


def get_model():
    if _model is None:
        load()
    return _model


def gpu_info() -> dict:
    if not torch.cuda.is_available():
        return {"available": False}
    idx = torch.cuda.current_device()
    return {
        "available": True,
        "device": torch.cuda.get_device_name(idx),
        "allocated_mb": round(torch.cuda.memory_allocated(idx) / (1024 * 1024), 2),
        "reserved_mb": round(torch.cuda.memory_reserved(idx) / (1024 * 1024), 2),
    }


def warmup() -> None:
    """Run a tiny dummy generation so the first real request is fast."""
    try:
        from inference import generate_once  # local import to avoid cycle

        logger.info("Warming up model with dummy generation…")
        _ = generate_once([{"role": "user", "content": "Hello."}], max_new_tokens=8)
        logger.info("Warmup complete.")
    except Exception as exc:  # pragma: no cover
        logger.warning("Warmup failed (non-fatal): %s", exc)


def shutdown() -> None:
    """Release GPU memory on graceful shutdown."""
    global _model, _tokenizer
    try:
        _model = None
        _tokenizer = None
        import gc

        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
    except Exception:  # pragma: no cover
        pass
