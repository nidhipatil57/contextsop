import os
import threading
import uuid
from urllib.parse import urlparse

import requests
from flask import Blueprint, g, jsonify, request
from pydantic import BaseModel, Field

from ..auth import require_auth
from ..config import Settings
from ..schemas import WorkflowDsl, migrate_sop_dsl
from ..services.llm import extract_sop_from_transcript
from ..services.redaction import redact_secrets

sop_bp = Blueprint("sop", __name__)

# Global in-memory storage for jobs and local SOP DB fallback
jobs = {}
jobs_lock = threading.Lock()

sops_db = {}
sops_lock = threading.Lock()


class GenerateRequest(BaseModel):
    transcript: str = Field(min_length=20, max_length=100_000)


def run_generation(job_id: str, transcript: str, org_id: str, user_id: str, auth_header: str):
    """
    Background worker thread to clean logs, run LLM context extraction,
    and save the generated runbook to Supabase or the in-memory fallback store.
    """
    with jobs_lock:
        jobs[job_id]["status"] = "processing"

    try:
        # 1. Redact any sensitive credentials or tokens from the logs
        safe_transcript = redact_secrets(transcript)

        # 2. Retrieve OpenAI API key and call the LLM service
        settings = Settings()
        api_key = settings.openai_api_key
        if not api_key:
            raise ValueError("OpenAI API key is missing. Please add it to your backend/.env file.")

        validated_dsl = extract_sop_from_transcript(safe_transcript, api_key)

        sop_id = str(uuid.uuid4())
        supabase_url = os.getenv("SUPABASE_URL")
        supabase_anon_key = os.getenv("SUPABASE_ANON_KEY")

        if supabase_url and supabase_anon_key:
            # Query Supabase via REST using user authentication context
            headers = {
                "Authorization": auth_header,
                "apikey": supabase_anon_key,
                "Content-Type": "application/json",
                "Prefer": "return=representation",
            }
            sop_payload = {
                "id": sop_id,
                "organization_id": org_id,
                "title": validated_dsl.metadata.title,
                "dsl_payload": validated_dsl.model_dump(by_alias=True),
                "description": validated_dsl.metadata.description,
                "original_transcript_id": "mock-transcript-id",
            }
            res = requests.post(f"{supabase_url}/rest/v1/sops", json=sop_payload, headers=headers)
            if res.status_code not in (200, 201):
                raise RuntimeError(f"Supabase SOP insertion failed: {res.text}")

            # Insert initial version into public.sop_versions
            version_payload = {
                "sop_id": sop_id,
                "dsl_payload": validated_dsl.model_dump(by_alias=True),
                "version_number": 1,
                "updated_by": user_id,
            }
            res_ver = requests.post(
                f"{supabase_url}/rest/v1/sop_versions", json=version_payload, headers=headers
            )
            if res_ver.status_code not in (200, 201):
                # Clean up orphaned SOP
                requests.delete(f"{supabase_url}/rest/v1/sops?id=eq.{sop_id}", headers=headers)
                raise RuntimeError(f"Supabase version logging failed: {res_ver.text}")
        else:
            # Fallback to local thread-safe memory DB
            with sops_lock:
                sops_db[sop_id] = {
                    "id": sop_id,
                    "organization_id": org_id,
                    "title": validated_dsl.metadata.title,
                    "description": validated_dsl.metadata.description,
                    "dsl_payload": validated_dsl.model_dump(by_alias=True),
                }

        with jobs_lock:
            jobs[job_id]["status"] = "completed"
            jobs[job_id]["sop_id"] = sop_id

    except Exception as e:
        with jobs_lock:
            jobs[job_id]["status"] = "failed"
            jobs[job_id]["error"] = str(e)


@sop_bp.post("/generate")
@require_auth
def generate_sop():
    """
    Spawns background generator worker and returns a job tracking URL.
    """
    payload = GenerateRequest.model_validate(request.get_json(silent=True) or {})
    job_id = str(uuid.uuid4())

    with jobs_lock:
        jobs[job_id] = {"status": "pending", "sop_id": None, "error": None}

    auth_header = request.headers.get("Authorization")

    # Start generation on a background thread
    t = threading.Thread(
        target=run_generation,
        args=(job_id, payload.transcript, g.org_id, g.user_id, auth_header),
    )
    t.start()

    polling_url = f"{request.host_url.rstrip('/')}/api/v1/sop/jobs/{job_id}"

    return jsonify(
        status="accepted",
        job_id=job_id,
        polling_url=polling_url,
        org_id=g.org_id,
        user_id=g.user_id,
    ), 202


@sop_bp.get("/jobs/<job_id>")
@require_auth
def get_job_status(job_id: str):
    """
    Polls the progress status of a generation job.
    """
    with jobs_lock:
        job = jobs.get(job_id)

    if not job:
        return jsonify(error="Not Found", message="Job identifier does not exist."), 404

    return jsonify(job)


@sop_bp.get("/<sop_id>")
@require_auth
def get_sop_details(sop_id: str):
    """
    Retrieves the record for a specific SOP.
    """
    supabase_url = os.getenv("SUPABASE_URL")
    supabase_anon_key = os.getenv("SUPABASE_ANON_KEY")

    if supabase_url and supabase_anon_key:
        headers = {
            "Authorization": request.headers.get("Authorization"),
            "apikey": supabase_anon_key,
        }
        # Fetch matching SOP, RLS checks organization membership at the data layer
        res = requests.get(f"{supabase_url}/rest/v1/sops?id=eq.{sop_id}", headers=headers)
        if res.status_code != 200:
            return jsonify(error="Database Error", message=res.text), res.status_code

        sops = res.json()
        if not sops:
            return jsonify(error="Not Found", message="SOP record not found or inaccessible."), 404

        sop_record = sops[0]
        if "dsl_payload" in sop_record:
            sop_record["dsl_payload"] = migrate_sop_dsl(sop_record["dsl_payload"])
        return jsonify(sop_record)
    else:
        with sops_lock:
            sop = sops_db.get(sop_id)

        if not sop or sop["organization_id"] != g.org_id:
            return jsonify(error="Not Found", message="SOP record not found or inaccessible."), 404

        sop_record = dict(sop)
        if "dsl_payload" in sop_record:
            sop_record["dsl_payload"] = migrate_sop_dsl(sop_record["dsl_payload"])
        return jsonify(sop_record)


@sop_bp.put("/<sop_id>")
@require_auth
def update_sop_details(sop_id: str):
    """
    Updates the SOP record details with a new validated Workflow DSL.
    """
    raw_payload = request.get_json(silent=True) or {}
    migrated_payload = migrate_sop_dsl(raw_payload)
    dsl_payload = WorkflowDsl.model_validate(migrated_payload)

    supabase_url = os.getenv("SUPABASE_URL")
    supabase_anon_key = os.getenv("SUPABASE_ANON_KEY")

    if supabase_url and supabase_anon_key:
        headers = {
            "Authorization": request.headers.get("Authorization"),
            "apikey": supabase_anon_key,
            "Content-Type": "application/json",
        }
        # First verify the SOP exists and matches permissions
        verify_res = requests.get(f"{supabase_url}/rest/v1/sops?id=eq.{sop_id}", headers=headers)
        if verify_res.status_code != 200 or not verify_res.json():
            return jsonify(error="Not Found", message="SOP not found or access denied."), 404

        # Retrieve expected version from payload
        expected_version = raw_payload.get("expectedVersionNumber") or raw_payload.get(
            "expected_version_number"
        )

        # Execute custom Postgres stored procedure create_new_sop_version
        rpc_payload = {
            "p_sop_id": sop_id,
            "p_dsl_payload": dsl_payload.model_dump(by_alias=True),
            "p_updated_by": g.user_id,
        }
        if expected_version is not None:
            rpc_payload["p_expected_version_number"] = int(expected_version)

        res = requests.post(
            f"{supabase_url}/rest/v1/rpc/create_new_sop_version",
            json=rpc_payload,
            headers=headers,
        )
        if res.status_code not in (200, 201):
            error_text = res.text
            if "VersionConflict" in error_text:
                return (
                    jsonify(
                        error="VersionConflict",
                        message=(
                            "The SOP was modified by another session. Please reload and try again."
                        ),
                    ),
                    409,
                )
            return (
                jsonify(error="Database Stored Procedure Error", message=error_text),
                res.status_code,
            )

        return jsonify(status="success", message="SOP updated and new version registered.")
    else:
        with sops_lock:
            sop = sops_db.get(sop_id)

        if not sop or sop["organization_id"] != g.org_id:
            return jsonify(error="Not Found", message="SOP not found or access denied."), 404

        with sops_lock:
            sops_db[sop_id]["dsl_payload"] = dsl_payload.model_dump(by_alias=True)
            sops_db[sop_id]["title"] = dsl_payload.metadata.title
            sops_db[sop_id]["description"] = dsl_payload.metadata.description

        return jsonify(status="success", message="SOP updated in local database.")


ALLOWED_VERIFICATION_DOMAINS = {
    "github.com",
    "api.github.com",
    "google.com",
    "httpbin.org",
    "status.payment-service.com",
    "localhost",
    "127.0.0.1",
}


@sop_bp.post("/verify")
@require_auth
def verify_endpoint():
    """
    SSRF-mitigated proxy to check status of a verification URL.
    Restricts requests to pre-approved domains.
    """
    payload = request.get_json(silent=True) or {}
    url = payload.get("url")
    if not url:
        return jsonify(error="Validation Error", message="URL is required."), 400

    try:
        parsed_url = urlparse(url)
        domain = parsed_url.hostname
        if not domain:
            return jsonify(error="Validation Error", message="Invalid URL hostname."), 400

        # Enforce domain whitelist check
        is_allowed = domain.lower() in ALLOWED_VERIFICATION_DOMAINS or domain.endswith(
            ".status.payment-service.com"
        )
        if not is_allowed:
            return jsonify(
                error="Unauthorized Domain",
                message=f"Verification domain '{domain}' is not in the approved whitelist.",
            ), 400

        # Perform the verification check (with timeout)
        res = requests.get(url, timeout=5)
        return jsonify(statusCode=res.status_code, statusText=res.reason, ok=res.status_code < 400)
    except requests.exceptions.RequestException as e:
        return jsonify(error="Connection Failed", message=str(e)), 400
    except Exception as e:
        return jsonify(error="Internal Error", message=str(e)), 500
