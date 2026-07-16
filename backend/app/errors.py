import requests.exceptions
from flask import Flask, jsonify
from pydantic import ValidationError
from werkzeug.exceptions import HTTPException


def register_error_handlers(app: Flask) -> None:
    @app.errorhandler(ValidationError)
    def validation_error(error: ValidationError):
        details = []
        for err in error.errors():
            details.append({
                "loc": err.get("loc"),
                "msg": str(err.get("msg")),
                "type": err.get("type"),
            })
        return jsonify(error={"code": "VALIDATION_ERROR", "details": details}), 400

    @app.errorhandler(requests.exceptions.Timeout)
    def timeout_error(error: requests.exceptions.Timeout):
        app.logger.exception("External service connection timed out")
        return (
            jsonify(
                error={
                    "code": "SERVICE_TIMEOUT",
                    "message": "A request to an external service timed out.",
                }
            ),
            504,
        )

    @app.errorhandler(requests.exceptions.RequestException)
    def requests_error(error: requests.exceptions.RequestException):
        app.logger.exception("External service request error")
        return (
            jsonify(
                error={
                    "code": "SERVICE_UNAVAILABLE",
                    "message": "An external service is temporarily unavailable.",
                }
            ),
            503,
        )

    @app.errorhandler(HTTPException)
    def http_error(error: HTTPException):
        return (
            jsonify(
                error={
                    "code": error.name.upper().replace(" ", "_"),
                    "message": error.description,
                }
            ),
            error.code,
        )

    @app.errorhandler(Exception)
    def unexpected_error(error: Exception):
        app.logger.exception("Unhandled application error")
        return (
            jsonify(error={"code": "INTERNAL_ERROR", "message": "An unexpected error occurred."}),
            500,
        )
