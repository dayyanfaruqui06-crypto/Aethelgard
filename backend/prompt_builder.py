"""Convert a list of role/content messages into the Qwen ChatML prompt format.

Uses the tokenizer's `apply_chat_template` when available (recommended) and
falls back to a manual <|im_start|>/<|im_end|> builder otherwise.
"""
from __future__ import annotations

from typing import Iterable, List, TypedDict


class ChatMessage(TypedDict):
    role: str
    content: str


VALID_ROLES = {"system", "user", "assistant", "tool"}


def normalize(messages: Iterable[dict]) -> List[ChatMessage]:
    out: List[ChatMessage] = []
    for m in messages:
        role = str(m.get("role", "user")).lower()
        if role not in VALID_ROLES:
            role = "user"
        content = m.get("content", "")
        if not isinstance(content, str):
            content = str(content)
        out.append({"role": role, "content": content})
    return out


def build_chatml(messages: List[ChatMessage], add_generation_prompt: bool = True) -> str:
    """Manual ChatML builder used as a fallback."""
    parts: List[str] = []
    for m in messages:
        parts.append(f"<|im_start|>{m['role']}\n{m['content']}<|im_end|>")
    if add_generation_prompt:
        # Empty <think> forces DeepSeek-R1 to skip reasoning and output structured response
        parts.append("<|im_start|>assistant\n<think>\n\n</think>\n")
    return "\n".join(parts)

def build_prompt(tokenizer, messages: List[ChatMessage]) -> str:
    msgs = normalize(messages)

    try:
        if hasattr(tokenizer, "apply_chat_template"):
            prompt = tokenizer.apply_chat_template(
                msgs, tokenize=False, add_generation_prompt=True
            )
            # Append empty <think> block to skip DeepSeek-R1 reasoning mode
            return prompt + "<think>\n\n</think>\n"
    except Exception:
        pass
    return build_chatml(msgs, add_generation_prompt=True)

def truncate_to_context(
    tokenizer,
    messages: List[ChatMessage],
    max_tokens: int,
) -> List[ChatMessage]:
    """Drop oldest non-system messages until the prompt fits the context window."""
    msgs = normalize(messages)
    while True:
        prompt = build_prompt(tokenizer, msgs)
        token_count = len(tokenizer.encode(prompt, add_special_tokens=False))
        if token_count <= max_tokens or len(msgs) <= 1:
            return msgs
        # Remove the oldest non-system message
        for i, m in enumerate(msgs):
            if m["role"] != "system":
                msgs.pop(i)
                break
        else:
            return msgs
