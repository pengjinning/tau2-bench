# Copyright Sierra

import threading
import uuid

import uvicorn
from fastapi import Body, FastAPI, HTTPException
from loguru import logger
from pydantic import BaseModel, TypeAdapter, ValidationError
from starlette.concurrency import run_in_threadpool

from tau2.config import API_PORT
from tau2.data_model.elicitation import ElicitationConfig, ElicitationStrategy
from tau2.data_model.simulation import Results, RunConfig, TextRunConfig
from tau2.multilingual.runtime import pin_language_artifacts
from tau2.registry import RegistryInfo, registry
from tau2.run import get_options, load_tasks, run_domain
from tau2.runner.helpers import select_run_tasks

from .data_model import GetTasksRequest, GetTasksResponse

app = FastAPI()

# Validates the documented text/voice config union without wrapping it in a
# subclass (RunConfig is a Union alias and cannot be subclassed).
_run_config_adapter: TypeAdapter[RunConfig] = TypeAdapter(RunConfig)


class StopRunRequest(BaseModel):
    """Stop signal for a run started with a ``run_id``."""

    run_id: str


class StopRunResponse(BaseModel):
    run_id: str
    stop_requested: bool


# Active runs keyed by run_id. A run registers its stop event at start and
# removes it at completion; one uvicorn worker process serves all runs here.
_active_runs: dict[str, threading.Event] = {}
_active_runs_lock = threading.Lock()


@app.get("/health")
def get_health() -> dict[str, str]:
    return {"app_health": "OK"}


@app.post("/api/v1/get_options")
def get_options_api() -> RegistryInfo:
    """Return the installed registry options."""
    try:
        return get_options()
    except Exception as e:
        logger.exception("Failed to load registry options")
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.post("/api/v1/get_tasks")
def get_tasks_api(
    request: GetTasksRequest,
) -> GetTasksResponse:
    """Preview run tasks, retaining canonical loading for legacy requests."""
    try:
        if request.language is None:
            tasks = load_tasks(request.domain)
        else:
            config = TextRunConfig(
                domain=request.domain,
                language=request.language,
                task_split_name=request.task_split_name,
                agent=request.agent,
                elicitation=(
                    ElicitationConfig(strategy=ElicitationStrategy.SCAFFOLDED)
                    if request.domain == "intake"
                    else None
                ),
            )
            tasks = select_run_tasks(config, pin_language_artifacts(config))
            task_filter = registry.get_agent_task_filter(request.agent)
            if task_filter is not None:
                tasks = [task for task in tasks if task_filter(task)]
        return GetTasksResponse(tasks=tasks)
    except (ValueError, KeyError) as e:
        logger.warning("Invalid task preview request: {}", e)
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        logger.exception("Failed to load task preview")
        raise HTTPException(status_code=500, detail=str(e)) from e


class _DuplicateRunId(ValueError):
    """A run is already active under the requested run_id."""


def _run_domain_with_stop(payload: dict) -> Results:
    """Execute a run, registering a stop event for its lifetime."""
    body = dict(payload)
    run_id = body.pop("run_id", None)
    if run_id is not None and not isinstance(run_id, str):
        raise ValueError("run_id must be a string")
    run_id = run_id or uuid.uuid4().hex
    stop_event = threading.Event()
    with _active_runs_lock:
        if run_id in _active_runs:
            raise _DuplicateRunId(f"run_id {run_id!r} is already active")
        _active_runs[run_id] = stop_event
    try:
        config = _run_config_adapter.validate_python(body)
        return run_domain(config, stop_event=stop_event)
    finally:
        with _active_runs_lock:
            _active_runs.pop(run_id, None)


@app.post("/api/v1/run_domain")
async def run_domain_api(
    payload: dict = Body(..., description="RunConfig fields; optional 'run_id'"),
) -> Results:
    """Execute blocking simulations off the ASGI event loop.

    Pass ``run_id`` to make the run stoppable via ``/api/v1/stop_run``. The
    id is not persisted with the results and is ignored by the runner.
    """
    try:
        return await run_in_threadpool(_run_domain_with_stop, payload)
    except _DuplicateRunId as e:
        logger.warning("Run id conflict: {}", e)
        raise HTTPException(status_code=409, detail=str(e)) from e
    except ValidationError as e:
        logger.warning("Invalid run request: {}", e)
        raise HTTPException(status_code=422, detail=e.errors(include_url=False)) from e
    except Exception as e:
        logger.exception("Simulation failed")
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.post("/api/v1/stop_run")
def stop_run_api(request: StopRunRequest) -> StopRunResponse:
    """Request a graceful stop of an active run.

    No new tasks are started; in-flight simulations finish and are
    checkpointed; the run's ``/api/v1/run_domain`` response then returns the
    partial Results. Unknown or already-finished run ids report
    ``stop_requested: false`` instead of failing so late UI actions are safe.
    """
    with _active_runs_lock:
        stop_event = _active_runs.get(request.run_id)
    if stop_event is None:
        return StopRunResponse(run_id=request.run_id, stop_requested=False)
    stop_event.set()
    logger.info("Stop requested for run {}", request.run_id)
    return StopRunResponse(run_id=request.run_id, stop_requested=True)


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=API_PORT)
