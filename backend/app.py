"""FastAPI entry point for the offline AI inference backend."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import model as model_module
from config import settings
from routes.chat import router as chat_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
)
logger = logging.getLogger("backend")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting backend — loading model…")
    try:
        model_module.load()
        if settings.warmup_on_startup:
            model_module.warmup()
    except Exception as exc:  # pragma: no cover
        logger.exception("Startup model load failed: %s", exc)
    yield
    logger.info("Shutting down — releasing GPU memory…")
    model_module.shutdown()


app = FastAPI(
    title="Aethelgard Inference Backend",
    version="0.1.0",
    description="FastAPI server for offline LoRA + Qwen ChatML inference.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_origins) if settings.cors_origins else ["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat_router)


@app.get("/health")
def health():
    info = model_module.gpu_info()
    loaded = model_module._model is not None  # noqa: SLF001
    return {
        "status": "online",
        "model_loaded": loaded,
        "model": settings.model_path,
        "adapter": settings.adapter_path,
        "gpu": info,
    }


@app.get("/v1/models")
def list_models():
    return {
        "object": "list",
        "data": [
            {
                "id": settings.model_path,
                "object": "model",
                "owned_by": "local",
            }
        ],
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app:app",
        host=settings.host,
        port=settings.port,
        reload=False,
        log_level="info",
    )
