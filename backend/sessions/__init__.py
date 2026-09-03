"""In-memory session store.

A simple `{session_id: [messages]}` dictionary, guarded by a lock. Good enough
to ship; swap for Redis / Postgres later without changing the call sites.
"""
from __future__ import annotations

import threading
import time
import uuid
from typing import Dict, List, Optional

_lock = threading.Lock()
_sessions: Dict[str, dict] = {}


def new_id() -> str:
    return str(uuid.uuid4())


def create(initial: Optional[List[dict]] = None) -> str:
    sid = new_id()
    with _lock:
        _sessions[sid] = {
            "messages": list(initial or []),
            "created_at": time.time(),
            "updated_at": time.time(),
        }
    return sid


def get(session_id: str) -> Optional[dict]:
    with _lock:
        s = _sessions.get(session_id)
        return None if s is None else dict(s)


def get_messages(session_id: str) -> List[dict]:
    with _lock:
        s = _sessions.get(session_id)
        return list(s["messages"]) if s else []


def append(session_id: str, message: dict) -> None:
    with _lock:
        s = _sessions.setdefault(
            session_id,
            {"messages": [], "created_at": time.time(), "updated_at": time.time()},
        )
        s["messages"].append(message)
        s["updated_at"] = time.time()


def replace(session_id: str, messages: List[dict]) -> None:
    with _lock:
        s = _sessions.setdefault(
            session_id,
            {"messages": [], "created_at": time.time(), "updated_at": time.time()},
        )
        s["messages"] = list(messages)
        s["updated_at"] = time.time()


def delete(session_id: str) -> bool:
    with _lock:
        return _sessions.pop(session_id, None) is not None


def list_ids() -> List[str]:
    with _lock:
        return list(_sessions.keys())
