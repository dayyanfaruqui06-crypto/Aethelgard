"""Central configuration for the inference backend.

All values can be overridden through environment variables so nothing is
hardcoded. Keep this file as the single source of truth for model paths,
generation defaults, and runtime limits.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from dotenv import load_dotenv

load_dotenv()


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _env_float(name: str, default: float) -> float:
    raw = os.getenv(name)
    try:
        return float(raw) if raw is not None else default
    except ValueError:
        return default


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    try:
        return int(raw) if raw is not None else default
    except ValueError:
        return default


@dataclass(frozen=True)
class Settings:
    # --- Model paths (NEVER hardcode in code) ---
    model_path: str = os.getenv("MODEL_PATH", "Qwen/Qwen2.5-7B-Instruct")
    adapter_path: str | None = os.getenv("ADAPTER_PATH") or None
    tokenizer_path: str | None = os.getenv("TOKENIZER_PATH") or None

    # --- Quantization ---
    load_in_4bit: bool = _env_bool("LOAD_IN_4BIT", True)
    bnb_4bit_quant_type: str = os.getenv("BNB_4BIT_QUANT_TYPE", "nf4")
    bnb_4bit_use_double_quant: bool = _env_bool("BNB_4BIT_DOUBLE_QUANT", True)
    bnb_4bit_compute_dtype: str = os.getenv("BNB_4BIT_COMPUTE_DTYPE", "bfloat16")

    # --- Generation defaults ---
    max_new_tokens: int = _env_int("MAX_NEW_TOKENS", 768)
    temperature: float = _env_float("TEMPERATURE", 0.7)
    top_p: float = _env_float("TOP_P", 0.9)
    top_k: int = _env_int("TOP_K", 40)
    repetition_penalty: float = _env_float("REPETITION_PENALTY", 1.1)

    # --- Safety / limits ---
    max_prompt_tokens: int = _env_int("MAX_PROMPT_TOKENS", 4096)
    max_messages_per_request: int = _env_int("MAX_MESSAGES_PER_REQUEST", 64)
    max_message_chars: int = _env_int("MAX_MESSAGE_CHARS", 8000)
    generation_timeout_s: float = _env_float("GENERATION_TIMEOUT_S", 120.0)
    context_window_tokens: int = _env_int("CONTEXT_WINDOW_TOKENS", 6144)

    # --- Server ---
    host: str = os.getenv("HOST", "0.0.0.0")
    port: int = _env_int("PORT", 8000)
    cors_origins: tuple[str, ...] = tuple(
        o.strip() for o in os.getenv("CORS_ORIGINS", "*").split(",") if o.strip()
    )

    # --- Warmup ---
    warmup_on_startup: bool = _env_bool("WARMUP_ON_STARTUP", True)


settings = Settings()
