"""Streaming helpers — wrap HF's TextIteratorStreamer into async generators
that yield OpenAI-compatible SSE chunks.
"""
from __future__ import annotations

import asyncio
import json
import time
import uuid
from typing import AsyncIterator, Iterable


def sse_pack(data: dict | str) -> str:
    if isinstance(data, dict):
        data = json.dumps(data, ensure_ascii=False)
    return f"data: {data}\n\n"


def openai_chunk(text: str, model: str, finish: str | None = None) -> dict:
    return {
        "id": f"chatcmpl-{uuid.uuid4().hex[:12]}",
        "object": "chat.completion.chunk",
        "created": int(time.time()),
        "model": model,
        "choices": [
            {
                "index": 0,
                "delta": {"content": text} if text else {},
                "finish_reason": finish,
            }
        ],
    }


async def iter_to_async(iterable: Iterable[str]) -> AsyncIterator[str]:
    """Bridge a blocking HF streamer to asyncio without freezing the loop."""
    loop = asyncio.get_event_loop()
    it = iter(iterable)
    sentinel = object()

    def _next():
        try:
            return next(it)
        except StopIteration:
            return sentinel

    while True:
        chunk = await loop.run_in_executor(None, _next)
        if chunk is sentinel:
            return
        yield chunk  # type: ignore[misc]
