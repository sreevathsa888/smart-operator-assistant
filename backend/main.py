"""Smart Operator Assistant – FastAPI backend.

    uvicorn backend.main:app --reload --port 8000      (from the repository root)
"""
import os
import sys
from contextlib import asynccontextmanager

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402

from backend import config  # noqa: E402
from backend import database as db  # noqa: E402
from backend.routes.api import router  # noqa: E402


@asynccontextmanager
async def lifespan(app: FastAPI):
    from ml.inference import anomaly, safety, task_time
    safety(); anomaly(); task_time()          # load models once
    db.ensure_seeded()                        # build the SQLite DB on first start
    from backend.services import twin
    twin.fleet()                              # warm fleet statistics
    yield


app = FastAPI(title="Smart Operator Assistant API", version="1.0.0", lifespan=lifespan,
              description="Prototype on synthetic data. Risk scores are project-defined, not official CAT metrics.")
app.add_middleware(CORSMiddleware, allow_origins=config.CORS_ORIGINS, allow_methods=["*"], allow_headers=["*"])
app.include_router(router)
