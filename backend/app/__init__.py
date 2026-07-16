from flask import Flask, g
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

from .config import Settings
from .errors import register_error_handlers
from .routes.auth import auth_bp
from .routes.export import export_bp
from .routes.health import health_bp
from .routes.sop import sop_bp
from .routes.component import component_bp


def get_limiter_key() -> str:
    if hasattr(g, "user_id") and g.user_id:
        return f"user:{g.user_id}"
    return get_remote_address()


limiter = Limiter(key_func=get_limiter_key, default_limits=["120 per minute"])


def create_app() -> Flask:
    settings = Settings()
    app = Flask(__name__)
    app.config.update(SECRET_KEY=settings.flask_secret_key, MAX_CONTENT_LENGTH=2 * 1024 * 1024)

    # Global CORS rule to prevent redirect/error CORS failures
    CORS(app, resources={r"/*": {"origins": [settings.frontend_origin]}})

    limiter.init_app(app)

    app.register_blueprint(health_bp, url_prefix="/api/v1")
    app.register_blueprint(sop_bp, url_prefix="/api/v1/sop")
    app.register_blueprint(auth_bp, url_prefix="/api/v1/auth")
    app.register_blueprint(export_bp, url_prefix="/api/v1/export")
    app.register_blueprint(component_bp, url_prefix="/api/v1/component")

    register_error_handlers(app)

    if settings.flask_env == "production" and (app.debug or app.config.get("DEBUG")):
        raise ValueError(
            "Security alert: Debug mode must not be enabled in production environments."
        )

    return app
