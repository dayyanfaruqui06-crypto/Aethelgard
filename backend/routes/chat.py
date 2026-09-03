"""Chat endpoints — OpenAI-compatible /v1/chat/completions plus a simple /chat.

Both streaming and non-streaming responses are supported. Streaming uses SSE
chunks shaped like OpenAI's, so the existing frontend client works unchanged.
"""
from __future__ import annotations

import json
import logging
import time
import uuid
from typing import List, Literal, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator
from sse_starlette.sse import EventSourceResponse

import sessions
from config import settings
from inference import generate_once, generate_stream
from utils.formatting import sanitize, split_thinking

logger = logging.getLogger(__name__)
router = APIRouter()


class ChatMessage(BaseModel):
    role: Literal["system", "user", "assistant", "tool"]
    content: str

    @field_validator("content")
    @classmethod
    def _limit_content(cls, v: str) -> str:
        if len(v) > settings.max_message_chars:
            raise ValueError(
                f"message content exceeds max length ({settings.max_message_chars})"
            )
        return v


class ChatRequest(BaseModel):
    messages: List[ChatMessage] = Field(..., min_length=1)
    model: Optional[str] = None
    stream: bool = False
    session_id: Optional[str] = None
    persist: bool = False
    temperature: Optional[float] = None
    top_p: Optional[float] = None
    top_k: Optional[int] = None
    max_tokens: Optional[int] = Field(default=None, alias="max_tokens")
    repetition_penalty: Optional[float] = None

    @field_validator("messages")
    @classmethod
    def _limit_messages(cls, v):
        if len(v) > settings.max_messages_per_request:
            raise ValueError("too many messages in a single request")
        return v


def _resolve_history(req: ChatRequest) -> List[dict]:
    """Merge stored session history (if any) with the incoming messages."""
    incoming = [m.model_dump() for m in req.messages]
    if req.session_id:
        stored = sessions.get_messages(req.session_id)
        if stored:
            # Avoid duplicating: if the last stored message equals the first incoming, skip
            return stored + incoming
    return incoming


def _persist(req: ChatRequest, history: List[dict], assistant_text: str) -> Optional[str]:
    if not req.persist:
        return req.session_id
    sid = req.session_id or sessions.create()
    sessions.replace(sid, history + [{"role": "assistant", "content": assistant_text}])
    return sid


@router.post("/v1/chat/completions")
async def chat_completions(req: ChatRequest):
    history = _resolve_history(req)
    model_name = req.model or settings.model_path

    if req.stream:
        async def event_source():
            buffer: list[str] = []
            cmpl_id = f"chatcmpl-{uuid.uuid4().hex[:12]}"
            created = int(time.time())

            # initial role chunk
            yield {
                "data": json.dumps({
                    "id": cmpl_id,
                    "object": "chat.completion.chunk",
                    "created": created,
                    "model": model_name,
                    "choices": [{"index": 0, "delta": {"role": "assistant"}, "finish_reason": None}],
                })
            }
            try:
                async for delta in generate_stream(
                    history,
                    max_new_tokens=req.max_tokens,
                    temperature=req.temperature,
                    top_p=req.top_p,
                    top_k=req.top_k,
                    repetition_penalty=req.repetition_penalty,
                ):
                    buffer.append(delta)
                    yield {
                        "data": json.dumps({
                            "id": cmpl_id,
                            "object": "chat.completion.chunk",
                            "created": created,
                            "model": model_name,
                            "choices": [
                                {"index": 0, "delta": {"content": delta}, "finish_reason": None}
                            ],
                        })
                    }
                full = sanitize("".join(buffer))
                _persist(req, history, full)

                yield {
                    "data": json.dumps({
                        "id": cmpl_id,
                        "object": "chat.completion.chunk",
                        "created": created,
                        "model": model_name,
                        "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}],
                    })
                }
                yield {"data": "[DONE]"}
            except Exception as exc:
                logger.exception("Streaming generation failed: %s", exc)
                yield {
                    "data": json.dumps({
                        "error": {"message": str(exc), "type": "inference_error"}
                    })
                }
                yield {"data": "[DONE]"}

        return EventSourceResponse(event_source())

    # Non-streaming
    try:
        text = generate_once(
            history,
            max_new_tokens=req.max_tokens,
            temperature=req.temperature,
            top_p=req.top_p,
            top_k=req.top_k,
            repetition_penalty=req.repetition_penalty,
        )
    except RuntimeError as exc:
        msg = str(exc).lower()
        if "out of memory" in msg or "cuda" in msg:
            raise HTTPException(status_code=503, detail=f"GPU error: {exc}") from exc
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Generation failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    thinking, answer = split_thinking(text)
    sid = _persist(req, history, text)

    return {
        "id": f"chatcmpl-{uuid.uuid4().hex[:12]}",
        "object": "chat.completion",
        "created": int(time.time()),
        "model": model_name,
        "session_id": sid,
        "choices": [
            {
                "index": 0,
                "message": {"role": "assistant", "content": text},
                "thinking": thinking,
                "response": answer,
                "finish_reason": "stop",
            }
        ],
    }


@router.post("/chat")
async def simple_chat(req: ChatRequest):
    """Tiny convenience endpoint that mirrors /v1/chat/completions."""
    return await chat_completions(req)


# --- Session management ---

class SessionCreate(BaseModel):
    messages: Optional[List[ChatMessage]] = None


@router.post("/v1/sessions")
def session_create(body: SessionCreate):
    sid = sessions.create([m.model_dump() for m in (body.messages or [])])
    return {"session_id": sid}


@router.get("/v1/sessions/{session_id}")
def session_get(session_id: str):
    s = sessions.get(session_id)
    if not s:
        raise HTTPException(status_code=404, detail="session not found")
    return {"session_id": session_id, **s}


@router.delete("/v1/sessions/{session_id}")
def session_delete(session_id: str):
    ok = sessions.delete(session_id)
    if not ok:
        raise HTTPException(status_code=404, detail="session not found")
    return {"deleted": True}
