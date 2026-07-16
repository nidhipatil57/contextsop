import os
from unittest.mock import MagicMock, patch

import pytest

from app import create_app


@pytest.fixture
def client():
    app = create_app()
    app.config["TESTING"] = True
    os.environ["SUPABASE_URL"] = "https://tlcrmkftdbetgzayivqm.supabase.co"
    os.environ["SUPABASE_ANON_KEY"] = "mock-key"
    with app.test_client() as client:
        yield client



@pytest.fixture
def auth_headers():
    return {"Authorization": "Bearer mock-token"}


@pytest.fixture
def valid_dsl():
    return {
        "version": "1.0.0",
        "metadata": {
            "title": "Database Crash Recovery",
            "description": "Workflow description for database recovery protocols.",
            "targetEnvironment": "staging",
            "estimatedDuration": 30,
        },
        "variables": [
            {
                "name": "DB_CONTAINER_NAME",
                "label": "Name of target db container",
                "type": "string",
                "defaultValue": "postgres-db",
            }
        ],
        "steps": [
            {
                "id": "step-1",
                "type": "command",
                "title": "Check logs",
                "content": "docker logs postgres-db",
            }
        ],
    }


@patch("requests.get")
def test_export_markdown_success(mock_get, client, auth_headers, valid_dsl):
    mock_auth = MagicMock()
    mock_auth.status_code = 200
    mock_auth.json.return_value = {
        "id": "user-uuid",
        "email": "user@example.com",
        "app_metadata": {"org_id": "org-uuid"},
    }
    mock_get.return_value = mock_auth

    res = client.post("/api/v1/export/markdown", json=valid_dsl, headers=auth_headers)
    assert res.status_code == 200
    assert "text/markdown" in res.headers["Content-Type"]
    assert "Database Crash Recovery" in res.text
    assert "docker logs postgres-db" in res.text


@patch("requests.get")
def test_export_html_success(mock_get, client, auth_headers, valid_dsl):
    mock_auth = MagicMock()
    mock_auth.status_code = 200
    mock_auth.json.return_value = {
        "id": "user-uuid",
        "email": "user@example.com",
        "app_metadata": {"org_id": "org-uuid"},
    }
    mock_get.return_value = mock_auth

    res = client.post("/api/v1/export/html", json=valid_dsl, headers=auth_headers)
    assert res.status_code == 200
    assert "text/html" in res.headers["Content-Type"]
    assert "<title>Database Crash Recovery | ContextSOP Runbook</title>" in res.text
    assert "postgres-db" in res.text



@patch("requests.get")
def test_export_pdf_success(mock_get, client, auth_headers, valid_dsl):
    mock_auth = MagicMock()
    mock_auth.status_code = 200
    mock_auth.json.return_value = {
        "id": "user-uuid",
        "email": "user@example.com",
        "app_metadata": {"org_id": "org-uuid"},
    }
    mock_get.return_value = mock_auth

    res = client.post("/api/v1/export/pdf", json=valid_dsl, headers=auth_headers)
    assert res.status_code == 200
    assert res.headers["Content-Type"] == "application/pdf"
    # PDF files start with %PDF- header
    assert res.data.startswith(b"%PDF-")


@patch("requests.get")
def test_export_validation_failure(mock_get, client, auth_headers):
    mock_auth = MagicMock()
    mock_auth.status_code = 200
    mock_auth.json.return_value = {
        "id": "user-uuid",
        "email": "user@example.com",
        "app_metadata": {"org_id": "org-uuid"},
    }
    mock_get.return_value = mock_auth

    # Empty payload or invalid fields
    res = client.post("/api/v1/export/markdown", json={}, headers=auth_headers)
    assert res.status_code == 400
    assert res.json["error"]["code"] == "VALIDATION_ERROR"
