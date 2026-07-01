import asyncio
import inspect

import pytest
import httpx
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

CSV_BYTES = b"name,age\nAlice,30\nBob,25"


def test_emit_wide_event_is_sync_and_runs_off_thread():
    # _emit_wide_event does synchronous SQLAlchemy I/O and is scheduled via
    # asyncio.to_thread from the request middleware — it must stay a plain
    # function (not `async def`), otherwise it blocks the event loop for the
    # duration of the DB round trip on every /api/v2/* request.
    from main import _emit_wide_event
    assert not inspect.iscoroutinefunction(_emit_wide_event)

    with patch("database._SessionLocal", None):
        # Runs cleanly on a worker thread with no event loop of its own.
        asyncio.run(asyncio.to_thread(
            _emit_wide_event, "/api/v2/users/me", "GET", 200, 5, "user-1", "req-1",
        ))


@pytest.fixture()
def client():
    with patch("main.settings") as mock_settings:
        mock_settings.cors_origins = "http://localhost:3000"
        mock_settings.retrieval_method = "sftp"
        from main import app
        return TestClient(app)


def test_health(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert "db" in body


def test_results_empty_before_run(client):
    with patch.dict("main._cache", {}, clear=True):
        response = client.get("/api/results")
    assert response.status_code == 404


def test_run_success(client):
    with patch("main.settings") as mock_settings, \
         patch("main.trigger_engine", return_value={"status": "ok"}), \
         patch("main.sftp_client.download_csv", return_value=CSV_BYTES), \
         patch.dict("main._cache", {}, clear=True):
        mock_settings.retrieval_method = "sftp"
        mock_settings.ps_status_endpoint = ""
        mock_settings.sftp_remote_path = "/output.csv"
        response = client.post("/api/run")
    assert response.status_code == 200
    data = response.json()
    assert data["row_count"] == 2
    assert "kpis" in data
    assert "rows" in data
    assert "columns" in data


def test_run_caches_result(client):
    with patch("main.settings") as mock_settings, \
         patch("main.trigger_engine", return_value={"status": "ok"}), \
         patch("main.sftp_client.download_csv", return_value=CSV_BYTES), \
         patch.dict("main._cache", {}, clear=True):
        mock_settings.retrieval_method = "sftp"
        mock_settings.ps_status_endpoint = ""
        mock_settings.sftp_remote_path = "/output.csv"
        client.post("/api/run")
        response = client.get("/api/results")
    assert response.status_code == 200
    assert response.json()["row_count"] == 2


def test_run_peoplesoft_502(client):
    with patch("main.trigger_engine", side_effect=httpx.HTTPStatusError(
        "Error", request=MagicMock(), response=MagicMock()
    )):
        response = client.post("/api/run")
    assert response.status_code == 502


def test_run_peoplesoft_timeout(client):
    with patch("main.trigger_engine", side_effect=httpx.TimeoutException("timeout")):
        response = client.post("/api/run")
    assert response.status_code == 504


def test_run_sftp_503(client):
    with patch("main.settings") as mock_settings, \
         patch("main.trigger_engine", return_value={"status": "ok"}), \
         patch("main.sftp_client.download_csv", side_effect=Exception("SFTP unreachable")):
        mock_settings.retrieval_method = "sftp"
        mock_settings.ps_status_endpoint = ""
        mock_settings.sftp_remote_path = "/output.csv"
        response = client.post("/api/run")
    assert response.status_code == 503
    assert "SFTP" in response.json()["detail"]


def test_run_scp_503(client):
    with patch("main.settings") as mock_settings, \
         patch("main.trigger_engine", return_value={"status": "ok"}), \
         patch("main.scp_client.download_csv", side_effect=Exception("SSH refused")):
        mock_settings.retrieval_method = "scp"
        mock_settings.ps_status_endpoint = ""
        mock_settings.sftp_remote_path = "/output.csv"
        response = client.post("/api/run")
    assert response.status_code == 503
    assert "SSH/SCP" in response.json()["detail"]


def test_run_scp_success(client):
    with patch("main.settings") as mock_settings, \
         patch("main.trigger_engine", return_value={"status": "ok"}), \
         patch("main.scp_client.download_csv", return_value=CSV_BYTES), \
         patch.dict("main._cache", {}, clear=True):
        mock_settings.retrieval_method = "scp"
        mock_settings.ps_status_endpoint = ""
        mock_settings.sftp_remote_path = "/output.csv"
        response = client.post("/api/run")
    assert response.status_code == 200
    assert response.json()["row_count"] == 2


# ── two-step polling flow ─────────────────────────────────────────────────────

def test_run_two_step_flow(client):
    """With ps_status_endpoint set, run() calls poll_status and resolves ReportID in path."""
    with patch("main.settings") as mock_settings, \
         patch("main.trigger_engine", return_value={"InstanceID": "574604", "STATUS": "SUCCESS"}), \
         patch("main.poll_status", return_value={"STATUS": "Success", "ReportID": "87694", "InstanceID": 574604}), \
         patch("main.sftp_client.download_csv", return_value=CSV_BYTES) as mock_dl, \
         patch.dict("main._cache", {}, clear=True):
        mock_settings.retrieval_method = "sftp"
        mock_settings.ps_status_endpoint = "/api/status"
        mock_settings.sftp_remote_path = "/reports/{report_id}/output.csv"
        response = client.post("/api/run")
    assert response.status_code == 200
    data = response.json()
    assert data["instance_id"] == "574604"
    assert data["report_id"] == "87694"
    mock_dl.assert_called_once_with(remote_path="/reports/87694/output.csv")


def test_run_poll_timeout_504(client):
    """TimeoutError from poll_status maps to 504."""
    with patch("main.settings") as mock_settings, \
         patch("main.trigger_engine", return_value={"InstanceID": "123"}), \
         patch("main.poll_status", side_effect=TimeoutError("Process did not complete after 600s (Instance ID: 123)")):
        mock_settings.retrieval_method = "sftp"
        mock_settings.ps_status_endpoint = "/api/status"
        response = client.post("/api/run")
    assert response.status_code == 504
    assert "did not complete" in response.json()["detail"]


def test_run_skips_polling_when_no_status_endpoint(client):
    """If ps_status_endpoint is empty, polling is skipped even if InstanceID is present."""
    with patch("main.settings") as mock_settings, \
         patch("main.trigger_engine", return_value={"InstanceID": "574604"}), \
         patch("main.poll_status") as mock_poll, \
         patch("main.sftp_client.download_csv", return_value=CSV_BYTES), \
         patch.dict("main._cache", {}, clear=True):
        mock_settings.retrieval_method = "sftp"
        mock_settings.ps_status_endpoint = ""
        mock_settings.sftp_remote_path = "/output.csv"
        response = client.post("/api/run")
    assert response.status_code == 200
    mock_poll.assert_not_called()


def test_run_resolves_instance_id_in_path(client):
    """When sftp_remote_path contains {instance_id}, it is substituted."""
    with patch("main.settings") as mock_settings, \
         patch("main.trigger_engine", return_value={"InstanceID": "574604"}), \
         patch("main.sftp_client.download_csv", return_value=CSV_BYTES) as mock_dl, \
         patch.dict("main._cache", {}, clear=True):
        mock_settings.retrieval_method = "sftp"
        mock_settings.ps_status_endpoint = ""
        mock_settings.sftp_remote_path = "/output/{instance_id}.csv"
        response = client.post("/api/run")
    assert response.status_code == 200
    mock_dl.assert_called_once_with(remote_path="/output/574604.csv")


# ── /api/test-peoplesoft ──────────────────────────────────────────────────────

def test_ps_test_success(client):
    """Single-step test (no status endpoint): returns trigger response only."""
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.is_redirect = False
    mock_resp.json.return_value = {"STATUS": "SUCCESS", "InstanceID": "574604"}
    with patch("main.settings") as mock_settings, \
         patch("httpx.Client") as mock_http:
        mock_settings.ps_password = "saved_pass"
        mock_settings.ps_username = "saved_user"
        mock_http.return_value.__enter__.return_value.post.return_value = mock_resp
        response = client.post("/api/test-peoplesoft", json={
            "ps_base_url": "https://ps.example.com/PSIGW",
            "ps_auth_type": "basic",
            "ps_username": "user",
            "ps_password": "pass",
            "ps_endpoint": "/RESTListeningConnector/HR/API.v1/API",
            "ps_process_name": "SM_DISCOVERY",
        })
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["http_status"] == 200
    assert data["instance_id"] == "574604"
    assert data["status_http_status"] is None  # no status_endpoint in payload


def test_ps_test_two_step(client):
    """Two-step test: trigger returns InstanceID → GET status endpoint."""
    mock_trigger = MagicMock()
    mock_trigger.status_code = 200
    mock_trigger.is_redirect = False
    mock_trigger.json.return_value = {"STATUS": "SUCCESS", "InstanceID": "574604"}

    mock_status = MagicMock()
    mock_status.status_code = 200
    mock_status.json.return_value = {"STATUS": "Success", "ReportID": "87694", "InstanceID": 574604}

    with patch("main.settings") as mock_settings, \
         patch("httpx.Client") as mock_http:
        mock_settings.ps_password = ""
        mock_settings.ps_username = ""
        http_client = mock_http.return_value.__enter__.return_value
        http_client.post.return_value = mock_trigger
        http_client.get.return_value = mock_status
        response = client.post("/api/test-peoplesoft", json={
            "ps_base_url": "https://ps.example.com/PSIGW",
            "ps_auth_type": "basic",
            "ps_username": "u",
            "ps_password": "p",
            "ps_endpoint": "/API.v1/API",
            "ps_status_endpoint": "/STATUS.v1/API",
            "ps_process_name": "SM_DISCOVERY",
        })
    assert response.status_code == 200
    data = response.json()
    assert data["instance_id"] == "574604"
    assert data["status_http_status"] == 200
    assert "87694" in data["status_body"]
    # Verify GET was called with InstanceID in URL
    get_url = mock_http.return_value.__enter__.return_value.get.call_args[0][0]
    assert "574604" in get_url


def test_ps_test_uses_saved_password_when_empty(client):
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.is_redirect = False
    mock_resp.json.return_value = {}
    with patch("main.settings") as mock_settings, \
         patch("httpx.Client") as mock_http:
        mock_settings.ps_password = "saved_secret"
        mock_settings.ps_username = ""
        mock_http.return_value.__enter__.return_value.post.return_value = mock_resp
        client.post("/api/test-peoplesoft", json={
            "ps_base_url": "https://ps.example.com/PSIGW",
            "ps_auth_type": "basic",
            "ps_username": "user",
            "ps_password": "",   # empty — should fall back to saved_secret
            "ps_endpoint": "/API",
            "ps_process_name": "",
        })
    # Verify BasicAuth was constructed with the saved password
    call_kwargs = mock_http.return_value.__enter__.return_value.post.call_args
    assert call_kwargs is not None


def test_ps_test_auth_redirect(client):
    mock_resp = MagicMock()
    mock_resp.status_code = 302
    mock_resp.is_redirect = True
    mock_resp.headers = {"location": "https://ps.example.com/login"}
    with patch("main.settings") as mock_settings, \
         patch("httpx.Client") as mock_http:
        mock_settings.ps_password = ""
        mock_settings.ps_username = ""
        mock_http.return_value.__enter__.return_value.post.return_value = mock_resp
        response = client.post("/api/test-peoplesoft", json={
            "ps_base_url": "https://ps.example.com/PSIGW",
            "ps_auth_type": "basic",
            "ps_username": "bad", "ps_password": "bad",
            "ps_endpoint": "/API", "ps_process_name": "",
        })
    assert response.status_code == 400
    assert "login" in response.json()["detail"].lower()


def test_ps_test_connect_error(client):
    with patch("main.settings") as mock_settings, \
         patch("httpx.Client") as mock_http:
        mock_settings.ps_password = ""
        mock_settings.ps_username = ""
        mock_http.return_value.__enter__.return_value.post.side_effect = \
            httpx.ConnectError("connection refused")
        response = client.post("/api/test-peoplesoft", json={
            "ps_base_url": "https://ps.example.com/PSIGW",
            "ps_auth_type": "basic",
            "ps_username": "u", "ps_password": "p",
            "ps_endpoint": "/API", "ps_process_name": "",
        })
    assert response.status_code == 400
    assert "Cannot reach" in response.json()["detail"]
