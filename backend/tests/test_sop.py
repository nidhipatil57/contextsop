import os
import time
from unittest.mock import MagicMock, patch

import pytest

from app import create_app
from app.schemas import WorkflowDsl


@pytest.fixture
def client():
    app = create_app()
    app.config["TESTING"] = True
    # Ensure env variables are mocked
    os.environ["SUPABASE_URL"] = "https://tlcrmkftdbetgzayivqm.supabase.co"
    os.environ["SUPABASE_ANON_KEY"] = "mock-key"
    os.environ["OPENAI_API_KEY"] = "mock-key"
    with app.test_client() as client:
        yield client


@pytest.fixture
def auth_headers():
    return {"Authorization": "Bearer mock-token"}


# We will use in-memory storage during mock requests
mock_supabase_db = {}


def mock_get_side_effect(url, headers=None, **kwargs):
    mock_res = MagicMock()
    mock_res.status_code = 200

    if "/auth/v1/user" in url:
        mock_res.json.return_value = {
            "id": "user-uuid",
            "email": "user@example.com",
            "app_metadata": {"org_id": "org-uuid"},
        }
    elif "/rest/v1/sops" in url:
        # Extract sop_id if present in url
        # e.g., https://mock.supabase.co/rest/v1/sops?id=eq.sop_id
        sop_id = url.split("eq.")[-1] if "eq." in url else None
        if sop_id and sop_id in mock_supabase_db:
            mock_res.json.return_value = [mock_supabase_db[sop_id]]
        else:
            mock_res.json.return_value = []
    else:
        mock_res.json.return_value = {}

    return mock_res


def mock_post_side_effect(url, json=None, headers=None, **kwargs):
    mock_res = MagicMock()
    mock_res.status_code = 201

    if "/rest/v1/sops" in url:
        if json and "id" in json:
            mock_supabase_db[json["id"]] = json
    elif "/rpc/create_new_sop_version" in url:
        # Handle update
        if json and "p_sop_id" in json:
            sop_id = json["p_sop_id"]
            if sop_id in mock_supabase_db:
                mock_supabase_db[sop_id]["dsl_payload"] = json["p_dsl_payload"]
                mock_supabase_db[sop_id]["title"] = json["p_dsl_payload"]["metadata"]["title"]
                mock_supabase_db[sop_id]["description"] = json["p_dsl_payload"]["metadata"][
                    "description"
                ]
        mock_res.status_code = 200
        mock_res.json.return_value = "mock-version-uuid"

    return mock_res


@patch("app.routes.sop.extract_sop_from_transcript")
@patch("requests.post", side_effect=mock_post_side_effect)
@patch("requests.get", side_effect=mock_get_side_effect)
def test_generate_sop_flow(mock_get, mock_post, mock_extract, client, auth_headers):
    # Mock LLM service response
    mock_extract.return_value = WorkflowDsl.model_validate(
        {
            "version": "1.0.0",
            "metadata": {
                "title": "Incident Resolution SOP",
                "description": "Generated workflow from SRE transcript.",
                "targetEnvironment": "production",
                "estimatedDuration": 15,
            },
            "variables": [
                {
                    "name": "TARGET_HOST",
                    "label": "Target Host Address",
                    "type": "string",
                    "defaultValue": "localhost",
                }
            ],
            "steps": [
                {
                    "id": "step-1",
                    "type": "command",
                    "title": "Verify service metrics",
                    "content": "curl -s http://localhost:8080/health | grep OK",
                    "payload": {"commandString": "curl -s http://localhost:8080/health | grep OK"},
                }
            ],
        }
    )

    # Request generation
    res = client.post(
        "/api/v1/sop/generate",
        json={"transcript": "Database failed repeatedly. Let us run restart." * 3},
        headers=auth_headers,
    )
    assert res.status_code == 202
    data = res.json
    assert data["status"] == "accepted"
    assert "job_id" in data
    assert "polling_url" in data

    job_id = data["job_id"]

    # Poll status immediately (should be pending or processing)
    res_status = client.get(f"/api/v1/sop/jobs/{job_id}", headers=auth_headers)
    assert res_status.status_code == 200
    assert res_status.json["status"] in ("pending", "processing", "completed")

    # Wait for background thread simulation to finish
    time.sleep(2.5)

    # Poll status again (should be completed)
    res_status_done = client.get(f"/api/v1/sop/jobs/{job_id}", headers=auth_headers)
    assert res_status_done.status_code == 200
    assert res_status_done.json["status"] == "completed"
    assert "sop_id" in res_status_done.json
    assert res_status_done.json["sop_id"] is not None

    sop_id = res_status_done.json["sop_id"]

    # Retrieve SOP record
    res_sop = client.get(f"/api/v1/sop/{sop_id}", headers=auth_headers)
    assert res_sop.status_code == 200
    assert res_sop.json["id"] == sop_id
    assert res_sop.json["organization_id"] == "org-uuid"
    assert "dsl_payload" in res_sop.json

    # Update SOP details with valid/invalid payload
    # 1. Invalid payload
    res_update_invalid = client.put(
        f"/api/v1/sop/{sop_id}",
        json={"version": "1.0"},  # Invalid: missing metadata, steps, variables
        headers=auth_headers,
    )
    assert res_update_invalid.status_code == 400
    assert res_update_invalid.json["error"]["code"] == "VALIDATION_ERROR"

    # 2. Valid payload
    valid_dsl = {
        "version": "1.0.0",
        "metadata": {
            "title": "Updated Incident SOP",
            "description": "An updated workflow description.",
            "targetEnvironment": "production",
            "estimatedDuration": 20,
        },
        "variables": [
            {
                "name": "DB_PORT",
                "label": "Database Connection Port",
                "type": "number",
                "defaultValue": "5432",
            }
        ],
        "steps": [
            {
                "id": "step-1",
                "type": "command",
                "title": "Run migrations",
                "content": "npm run db:migrate",
            }
        ],
    }
    res_update_valid = client.put(
        f"/api/v1/sop/{sop_id}",
        json=valid_dsl,
        headers=auth_headers,
    )
    assert res_update_valid.status_code == 200
    assert res_update_valid.json["status"] == "success"

    # Verify update
    res_sop_updated = client.get(f"/api/v1/sop/{sop_id}", headers=auth_headers)
    assert res_sop_updated.status_code == 200
    assert res_sop_updated.json["title"] == "Updated Incident SOP"


@patch("requests.post", side_effect=mock_post_side_effect)
@patch("requests.get", side_effect=mock_get_side_effect)
def test_sop_validation_reserved_keywords(mock_get, mock_post, client, auth_headers):
    payload = {
        "version": "1.0.0",
        "metadata": {
            "title": "Invalid Variable SOP",
            "description": "Checks reserved keyword.",
        },
        "variables": [
            {
                "name": "IF",
                "label": "Conditional",
                "type": "string",
                "defaultValue": "test",
            }
        ],
        "steps": [
            {
                "id": "step-1",
                "type": "command",
                "title": "Run test",
                "content": "echo test",
            }
        ],
    }
    res = client.put("/api/v1/sop/some-uuid", json=payload, headers=auth_headers)
    assert res.status_code == 400
    assert res.json["error"]["code"] == "VALIDATION_ERROR"
    assert any("IF" in str(err) or "reserved" in str(err) for err in res.json["error"]["details"])


@patch("requests.post", side_effect=mock_post_side_effect)
@patch("requests.get", side_effect=mock_get_side_effect)
def test_sop_validation_dependencies(mock_get, mock_post, client, auth_headers):
    # 1. Missing dependency
    payload_missing = {
        "version": "1.0.0",
        "metadata": {
            "title": "Missing Dep SOP",
            "description": "Checks missing dependencies.",
        },
        "variables": [],
        "steps": [
            {
                "id": "step-1",
                "type": "command",
                "title": "Run test",
                "content": "echo test",
                "dependsOn": ["non-existent-step"],
            }
        ],
    }
    res = client.put("/api/v1/sop/some-uuid", json=payload_missing, headers=auth_headers)
    assert res.status_code == 400
    assert res.json["error"]["code"] == "VALIDATION_ERROR"
    assert any("non-existent-step" in str(err) for err in res.json["error"]["details"])

    # 2. Circular dependency
    payload_circular = {
        "version": "1.0.0",
        "metadata": {
            "title": "Circular Dep SOP",
            "description": "Checks circular dependencies.",
        },
        "variables": [],
        "steps": [
            {
                "id": "step-1",
                "type": "command",
                "title": "Step 1",
                "content": "echo 1",
                "dependsOn": ["step-2"],
            },
            {
                "id": "step-2",
                "type": "command",
                "title": "Step 2",
                "content": "echo 2",
                "dependsOn": ["step-1"],
            }
        ],
    }
    res = client.put("/api/v1/sop/some-uuid", json=payload_circular, headers=auth_headers)
    assert res.status_code == 400
    assert res.json["error"]["code"] == "VALIDATION_ERROR"
    assert any("Circular dependency" in str(err) for err in res.json["error"]["details"])


def test_sop_migration_utility():
    from app.schemas import migrate_sop_dsl, WorkflowDsl
    legacy_payload = {
        "version": "0.1",
        "metadata": {
            "title": "Legacy SOP",
            "description": "A legacy format runbook.",
        },
        "variables": [
            {
                "name": "HOST",
                "label": "Target Host",
                "type": "string",
                "default_value": "localhost",
                "validation_regex": ".*",
            }
        ],
        "steps": [
            {
                "id": "step-1",
                "type": "command",
                "title": "Run verify",
                "content": "curl -s localhost",
                "depends_on": ["step-2"],
                "payload": {
                    "command_string": "curl -s localhost",
                    "warning_level": "info",
                }
            },
            {
                "id": "step-2",
                "type": "warning",
                "title": "Alert",
                "content": "Attention",
            }
        ],
    }
    
    migrated = migrate_sop_dsl(legacy_payload)
    
    assert migrated["version"] == "1.0.0"
    assert "defaultValue" in migrated["variables"][0]
    assert migrated["variables"][0]["defaultValue"] == "localhost"
    assert "validationRegex" in migrated["variables"][0]
    
    assert "dependsOn" in migrated["steps"][0]
    assert migrated["steps"][0]["dependsOn"] == ["step-2"]
    
    assert "commandString" in migrated["steps"][0]["payload"]
    assert migrated["steps"][0]["payload"]["commandString"] == "curl -s localhost"
    assert "warningLevel" in migrated["steps"][0]["payload"]
    assert migrated["steps"][0]["payload"]["warningLevel"] == "info"
    
    validated = WorkflowDsl.model_validate(migrated)
    assert validated.version == "1.0.0"
    assert validated.variables[0].default_value == "localhost"
    assert validated.steps[0].depends_on == ["step-2"]
    assert validated.steps[0].payload.command_string == "curl -s localhost"

