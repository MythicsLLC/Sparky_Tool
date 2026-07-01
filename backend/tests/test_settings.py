from types import SimpleNamespace

import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient


SETTINGS_PAYLOAD = {
    "ps_base_url": "https://ps.new.com",
    "ps_auth_type": "basic",
    "ps_username": "newuser",
    "ps_password": "newpass",
    "ps_endpoint": "/api/new",
    "ps_process_name": "APPR_CLD_AE",
    "sftp_host": "sftp.new.com",
    "sftp_port": "22",
    "sftp_username": "sftpuser",
    "sftp_password": "sftppass",
    "sftp_remote_path": "/new.csv",
    "cors_origins": "http://localhost:3000",
}


@pytest.fixture()
def client():
    # yield inside the patch context so the mock stays alive during the test
    with patch("main.settings") as mock_settings:
        mock_settings.cors_origins = "http://localhost:3000"
        mock_settings.ps_base_url = "https://ps.example.com"
        mock_settings.ps_auth_type = "basic"
        mock_settings.ps_username = "user"
        mock_settings.ps_password = "secret"
        mock_settings.ps_endpoint = "/api/query"
        mock_settings.ps_process_name = "APPR_CLD_AE"
        mock_settings.sftp_host = "sftp.example.com"
        mock_settings.sftp_port = 22
        mock_settings.sftp_username = "sftpuser"
        mock_settings.sftp_password = "sftppass"
        mock_settings.sftp_remote_path = "/output.csv"
        from main import app
        from auth import require_admin

        # /api/settings is admin-only; simulate an authenticated admin so these
        # tests exercise the settings logic without needing a real database.
        app.dependency_overrides[require_admin] = lambda: SimpleNamespace(id="test-admin", role="admin")
        try:
            yield TestClient(app)
        finally:
            app.dependency_overrides.pop(require_admin, None)


def test_get_settings_returns_masked_passwords(client):
    response = client.get("/api/settings")
    assert response.status_code == 200
    data = response.json()
    assert "ps_base_url" in data
    assert data["ps_password"] == "***"
    assert data["sftp_password"] == "***"
    assert data["ps_process_name"] == "APPR_CLD_AE"


def test_post_settings_calls_update_env(client):
    with patch("main.update_env") as mock_update, \
         patch("main.get_settings") as mock_gs:
        mock_gs.return_value.cors_origins = "http://localhost:3000"
        response = client.post("/api/settings", json=SETTINGS_PAYLOAD)
    assert response.status_code == 200
    assert response.json()["status"] == "saved"
    mock_update.assert_called_once()


def test_get_settings_requires_auth():
    from main import app
    from database import get_db

    # Stub out the DB dependency so the auth check (which runs after FastAPI
    # resolves get_db) is exercised without needing a real DATABASE_URL.
    app.dependency_overrides[get_db] = lambda: iter([None])
    try:
        with patch("main.settings"):
            response = TestClient(app).get("/api/settings")
    finally:
        app.dependency_overrides.pop(get_db, None)
    assert response.status_code == 401


def test_post_settings_requires_auth():
    from main import app
    from database import get_db

    app.dependency_overrides[get_db] = lambda: iter([None])
    try:
        with patch("main.settings"):
            response = TestClient(app).post("/api/settings", json=SETTINGS_PAYLOAD)
    finally:
        app.dependency_overrides.pop(get_db, None)
    assert response.status_code == 401
