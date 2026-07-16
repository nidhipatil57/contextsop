from flask import Blueprint, g, jsonify

from ..auth import require_auth

auth_bp = Blueprint("auth", __name__)


@auth_bp.get("/me")
@require_auth
def get_me():
    """
    Returns the currently authenticated user's ID, email, and organization ID.
    """
    return jsonify(
        user_id=g.user_id,
        email=g.user_email,
        org_id=g.org_id,
    )


@auth_bp.get("/org")
@require_auth
def get_org():
    """
    Returns the organization membership ID for the authenticated user.
    """
    return jsonify(
        org_id=g.org_id,
    )
