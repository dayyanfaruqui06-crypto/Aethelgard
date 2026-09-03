# Aethelgard Inference Backend

A FastAPI server for **offline** LLM inference (Qwen ChatML format + optional
LoRA adapter, 4-bit quantization, streaming SSE). OpenAI-compatible endpoints
so your existing frontend works without changes.

## Install

```bash
cd backend
python -m venv .venv && source .venv/bin/activate   # (Windows: .venv\Scripts\activate)
pip install -r requirements.txt
```

> `bitsandbytes` requires CUDA. On CPU-only machines, set `LOAD_IN_4BIT=false`
> in your `.env` and the loader falls back to fp16/bf16.

## Configure

Copy `.env.example` to `.env` and edit:

```bash
cp .env.example .env
```

The two values you almost always want to change:

- `MODEL_PATH` — local folder OR a HF hub id (e.g. `Qwen/Qwen2.5-7B-Instruct`)
- `ADAPTER_PATH` — your trained LoRA adapter directory (optional)

## Run

```bash
python app.py
# or
uvicorn app:app --host 0.0.0.0 --port 8000
```

First boot loads the model (slow), runs a tiny warmup generation, then waits
on requests.

## Endpoints

| Method | Path                          | Purpose                                |
|-------:|-------------------------------|----------------------------------------|
| GET    | `/health`                     | Status + GPU memory info               |
| GET    | `/v1/models`                  | OpenAI-compatible model listing        |
| POST   | `/v1/chat/completions`        | OpenAI-compatible chat (stream + sync) |
| POST   | `/chat`                       | Alias of `/v1/chat/completions`        |
| POST   | `/v1/sessions`                | Create a server-side session           |
| GET    | `/v1/sessions/{id}`           | Inspect a session                      |
| DELETE | `/v1/sessions/{id}`           | Delete a session                       |

### Streaming request

```bash
curl -N -X POST http://localhost:8000/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{"stream": true, "messages": [{"role":"user","content":"Hello"}]}'
```

The response is OpenAI-style SSE: `data: {chunk}\n\n` ending with `data: [DONE]`.

### Non-streaming response shape

```json
{
  "id": "chatcmpl-…",
  "model": "Qwen/Qwen2.5-7B-Instruct",
  "session_id": null,
  "choices": [{
    "message":  {"role":"assistant","content":"<think>…</think>final answer"},
    "thinking": "…",
    "response": "final answer",
    "finish_reason": "stop"
  }]
}
```

The backend already splits `<think>` blocks for you, but also returns the raw
content so the frontend's `MessageContent` renderer stays in charge.

## Connect the frontend

In the project root, set:

```
VITE_API_URL=http://localhost:8000/v1/chat/completions
```

The existing `HealthBadge` will hit `/v1/models` and `/health` automatically.

## Notes

- All generation is serialized by a single `asyncio.Lock` to protect VRAM.
- CUDA cache is emptied after every request.
- Prompts auto-truncate to `CONTEXT_WINDOW_TOKENS` (oldest non-system msgs drop first).
- Sessions are in-memory (process-local). Swap `sessions/__init__.py` for Redis
  or a DB when you need persistence across restarts.
