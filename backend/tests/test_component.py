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
    os.environ["OPENAI_API_KEY"] = "mock-key"
    with app.test_client() as client:
        yield client


@pytest.fixture
def auth_headers():
    return {"Authorization": "Bearer mock-token"}


def mock_auth_get(url, headers=None, **kwargs):
    mock_res = MagicMock()
    mock_res.status_code = 200
    if "/auth/v1/user" in url:
        mock_res.json.return_value = {
            "id": "user-uuid",
            "email": "user@example.com",
            "app_metadata": {"org_id": "org-uuid"},
        }
    return mock_res


@patch("app.routes.component.OpenAI")
@patch("requests.get", side_effect=mock_auth_get)
def test_generate_component_success(mock_get, mock_openai_cls, client, auth_headers):
    mock_client = MagicMock()
    mock_openai_cls.return_value = mock_client
    
    mock_choice = MagicMock()
    mock_parsed = MagicMock()
    mock_parsed.code = "export default function TestComp() { return <div>Test</div>; }"
    mock_parsed.component_name = "TestComp"
    
    mock_choice.message.parsed = mock_parsed
    
    mock_completion = MagicMock()
    mock_completion.choices = [mock_choice]
    
    mock_client.beta.chat.completions.parse.return_value = mock_completion

    res = client.post(
        "/api/v1/component/generate",
        json={"prompt": "Log colorizer widget"},
        headers=auth_headers
    )
    
    assert res.status_code == 200
    assert "code" in res.json
    assert "componentName" in res.json
    assert res.json["code"] == "export default function TestComp() { return <div>Test</div>; }"
    assert res.json["componentName"] == "TestComp"


@patch("requests.get", side_effect=mock_auth_get)
def test_generate_component_validation_error(mock_get, client, auth_headers):
    # Prompt is too short (min 3 characters)
    res = client.post(
        "/api/v1/component/generate",
        json={"prompt": "ab"},
        headers=auth_headers
    )
    assert res.status_code == 400
    assert res.json["error"]["code"] == "VALIDATION_ERROR"
