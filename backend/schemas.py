"""Request bodies. Responses are plain JSON documented in docs/api.md."""
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


class SafetyRequest(BaseModel):
    inputs: dict[str, Any] = Field(..., description="Dataset column names or aliases speed/distance/load/slope/visibility")
    operator_id: Optional[str] = None
    machine_id: Optional[str] = None
    explain: bool = True


class TaskTimeRequest(BaseModel):
    task: dict[str, Any]


class AnomalyRequest(BaseModel):
    operator_id: str
    session: Optional[dict[str, Any]] = Field(None, description="Omit to analyse the operator's current shift session")


class SimulationRiskRequest(BaseModel):
    scenario: Optional[dict[str, Any]] = None
    scenarios: Optional[list[dict[str, Any]]] = Field(None, max_length=400)
    operator_id: Optional[str] = None
    machine_id: Optional[str] = None
    explain: bool = False


class DecisionRequest(BaseModel):
    state: dict[str, Any]
    choice: Optional[Literal["A", "B", "C", "D"]] = None
    operator_id: Optional[str] = None
    machine_id: Optional[str] = None


class TelemetryEvent(BaseModel):
    action: Literal["start", "stop", "dismiss"]
    operator_id: Optional[str] = None


class TrainingComplete(BaseModel):
    operator_id: str
    module_id: str
    correct: bool
    answer: Optional[str] = None
