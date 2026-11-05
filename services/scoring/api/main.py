"""FastAPI surface for the scoring service.

The Fastify API in apps/api owns the product endpoints. This service exposes
only what cannot live in Node: the scoring and validation runs, plus a health
check so the deployment knows whether the Python side is up.
"""

from __future__ import annotations

from typing import Literal

from fastapi import FastAPI
from pydantic import BaseModel, Field

from db import health
from metrics.constants import KILL_CRITERIA, MODEL_VERSION

app = FastAPI(title="Linchpin Scoring", version=MODEL_VERSION)


class HealthResponse(BaseModel):
    status: Literal["ok", "degraded"]
    model_version: str = Field(serialization_alias="modelVersion")
    database: bool


class CriteriaResponse(BaseModel):
    model_version: str = Field(serialization_alias="modelVersion")
    kill_criteria: dict[str, float] = Field(serialization_alias="killCriteria")


@app.get("/health", response_model=HealthResponse, response_model_by_alias=True)
def get_health() -> HealthResponse:
    database_up = health()
    return HealthResponse(
        status="ok" if database_up else "degraded",
        model_version=MODEL_VERSION,
        database=database_up,
    )


@app.get("/criteria", response_model=CriteriaResponse, response_model_by_alias=True)
def get_criteria() -> CriteriaResponse:
    """The kill criteria, served so the UI never hardcodes a threshold."""
    return CriteriaResponse(model_version=MODEL_VERSION, kill_criteria=dict(KILL_CRITERIA))
