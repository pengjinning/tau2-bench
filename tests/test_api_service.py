import asyncio
import threading

import httpx
import pytest
from fastapi.testclient import TestClient

from tau2.api_service import simulation_service as service
from tau2.data_model.elicitation import ElicitationConfig, ElicitationStrategy
from tau2.data_model.simulation import TextRunConfig
from tau2.multilingual.runtime import pin_language_artifacts
from tau2.runner.helpers import select_run_tasks


def test_legacy_task_preview(monkeypatch):
    called = []
    monkeypatch.setattr(
        service, "load_tasks", lambda domain: called.append(domain) or []
    )
    response = TestClient(service.app).post(
        "/api/v1/get_tasks", json={"domain": "mock"}
    )
    assert response.status_code == 200
    assert called == ["mock"]


@pytest.mark.parametrize(
    "domain,language",
    [("mock", "en"), ("retail", "en"), ("retail", "zh"), ("intake", "en")],
)
def test_preview_matches_run_tasks(domain, language):
    config = TextRunConfig(
        domain=domain,
        language=language,
        elicitation=(
            ElicitationConfig(strategy=ElicitationStrategy.SCAFFOLDED)
            if domain == "intake"
            else None
        ),
    )
    expected = select_run_tasks(config, pin_language_artifacts(config))
    response = TestClient(service.app).post(
        "/api/v1/get_tasks", json={"domain": domain, "language": language}
    )
    assert response.status_code == 200, response.text
    actual = response.json()["tasks"]
    expected = [task.model_dump(mode="json") for task in expected]
    # Mock tasks synthesize initial message timestamps when loaded.
    for collection in (actual, expected):
        for task in collection:
            for message in (task.get("initial_state") or {}).get(
                "message_history"
            ) or []:
                message.pop("timestamp", None)
    assert actual == expected


def test_invalid_language_is_reported():
    response = TestClient(service.app).post(
        "/api/v1/get_tasks", json={"domain": "retail", "language": "invalid-language"}
    )
    assert response.status_code == 400
    assert response.json()["detail"]


def test_blocking_run_does_not_block_health(monkeypatch):
    asyncio.run(_check_health_during_run(monkeypatch))


async def _check_health_during_run(monkeypatch):
    started = threading.Event()
    release = threading.Event()

    def fake_run(config, stop_event=None):
        started.set()
        if not release.wait(5):
            raise RuntimeError("Test failed to release the run")
        raise ValueError("Stubbed run failure")

    monkeypatch.setattr(service, "run_domain", fake_run)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=service.app), base_url="http://test"
    ) as client:
        run = asyncio.create_task(
            client.post("/api/v1/run_domain", json={"domain": "mock"})
        )
        try:
            assert await asyncio.to_thread(started.wait, 2)
            health = await asyncio.wait_for(client.get("/health"), timeout=1)
            assert health.json() == {"app_health": "OK"}
        finally:
            release.set()
        response = await run
        assert response.status_code == 500
        assert response.json()["detail"] == "Stubbed run failure"


def test_stop_run_gracefully_returns_partial_results(monkeypatch, tmp_path):
    """A stop request ends the API run with whatever simulations completed."""
    from tau2.data_model.simulation import SimulationRun
    from tau2.runner import batch

    started = threading.Event()
    release = threading.Event()

    def fake_run_unit(ctx, task, trial, seed, progress_str=""):
        # First unit blocks until the test releases it; every unit after the
        # stop request raises the runner's own pre-start shutdown signal.
        if started.is_set():
            raise KeyboardInterrupt("Shutdown requested")
        started.set()
        release.wait(5)
        return SimulationRun(
            id=f"{task.id}-{trial}",
            task_id=task.id,
            start_time="",
            end_time="",
            duration=0.0,
            termination_reason="user_stop",
        )

    monkeypatch.setattr(batch, "run_unit", fake_run_unit)

    config = TextRunConfig(
        domain="mock",
        num_trials=4,
        max_concurrency=1,
        save_to=str(tmp_path / "stopped_run"),
    )
    tasks = batch._load_run_tasks(config)

    result_box: dict = {}

    def drive():
        result_box["results"] = batch.run_tasks(config, tasks, stop_event=stop_event)

    stop_event = threading.Event()
    thread = threading.Thread(target=drive)
    thread.start()
    try:
        assert started.wait(5), "first unit never started"
        stop_event.set()
    finally:
        release.set()
    thread.join(30)
    assert not thread.is_alive()
    results = result_box["results"]
    assert len(results.simulations) == 1
    assert results.simulations[0].task_id == tasks[0].id


def test_stop_run_endpoint(monkeypatch):
    """The stop endpoint signals active runs and tolerates unknown ids."""
    with TestClient(service.app) as client:
        stop_event = threading.Event()
        with service._active_runs_lock:
            service._active_runs["run-1"] = stop_event
        try:
            response = client.post("/api/v1/stop_run", json={"run_id": "run-1"})
            assert response.status_code == 200
            assert response.json() == {"run_id": "run-1", "stop_requested": True}
            assert stop_event.is_set()
        finally:
            with service._active_runs_lock:
                service._active_runs.pop("run-1", None)

        late = client.post("/api/v1/stop_run", json={"run_id": "run-1"})
        assert late.status_code == 200
        assert late.json() == {"run_id": "run-1", "stop_requested": False}


def test_duplicate_run_id_is_rejected(monkeypatch):
    """Starting a second run under a live run_id fails instead of hijacking it."""
    with service._active_runs_lock:
        service._active_runs["dup-run"] = threading.Event()
    try:
        with TestClient(service.app) as client:
            response = client.post(
                "/api/v1/run_domain", json={"domain": "mock", "run_id": "dup-run"}
            )
            assert response.status_code == 409
    finally:
        with service._active_runs_lock:
            service._active_runs.pop("dup-run", None)
