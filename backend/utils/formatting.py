"""Response sanitization + <think> block parsing."""
from __future__ import annotations

import re
from typing import Tuple

_THINK_RE = re.compile(r"<think>(.*?)</think>", re.DOTALL | re.IGNORECASE)
_STRAY_TAGS = re.compile(r"<\|im_(start|end)\|>(?:assistant|user|system)?\n?", re.IGNORECASE)


def split_thinking(text: str) -> Tuple[str, str]:
    """Return (thinking, response). Handles streaming-incomplete <think>."""
    thinking_parts = _THINK_RE.findall(text)
    cleaned = _THINK_RE.sub("", text)

    # If a <think> was opened but never closed, treat the tail as thinking.
    if "<think>" in cleaned.lower() and "</think>" not in cleaned.lower():
        idx = cleaned.lower().rfind("<think>")
        thinking_parts.append(cleaned[idx + len("<think>"):])
        cleaned = cleaned[:idx]

    return ("\n\n".join(p.strip() for p in thinking_parts).strip(), cleaned.strip())


def sanitize(text: str) -> str:
    """Strip stray chat tokens + collapse repeated whitespace."""
    if not text:
        return ""
    text = _STRAY_TAGS.sub("", text)
    text = text.replace("<|endoftext|>", "")
    # Collapse 3+ blank lines to 2
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()
