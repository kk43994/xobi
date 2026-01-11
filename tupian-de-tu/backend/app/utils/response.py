"""
Unified response format utilities for FastAPI
与 xobixiangqing/backend/utils/response.py 保持一致的响应格式
"""
from typing import Any, Optional
from fastapi.responses import JSONResponse


def success_response(
    data: Any = None,
    message: str = "Success",
    status_code: int = 200
) -> JSONResponse:
    """
    Generate a successful response

    Args:
        data: Response data
        message: Success message
        status_code: HTTP status code

    Returns:
        JSONResponse with unified format
    """
    response = {
        "success": True,
        "message": message
    }

    if data is not None:
        response["data"] = data

    return JSONResponse(content=response, status_code=status_code)


def error_response(
    error_code: str,
    message: str,
    status_code: int = 400
) -> JSONResponse:
    """
    Generate an error response

    Args:
        error_code: Error code identifier
        message: Error message
        status_code: HTTP status code

    Returns:
        JSONResponse with unified format
    """
    return JSONResponse(
        content={
            "success": False,
            "error": {
                "code": error_code,
                "message": message
            }
        },
        status_code=status_code
    )


# Common error responses
def bad_request(message: str = "Invalid request") -> JSONResponse:
    return error_response("INVALID_REQUEST", message, 400)


def not_found(resource: str = "Resource") -> JSONResponse:
    return error_response(f"{resource.upper()}_NOT_FOUND", f"{resource} not found", 404)


def ai_service_error(message: str = "AI service error") -> JSONResponse:
    return error_response("AI_SERVICE_ERROR", message, 503)


def rate_limit_error(message: str = "Rate limit exceeded") -> JSONResponse:
    return error_response("RATE_LIMIT_EXCEEDED", message, 429)


def internal_error(message: str = "Internal server error") -> JSONResponse:
    return error_response("INTERNAL_ERROR", message, 500)


def timeout_error(message: str = "Request timeout") -> JSONResponse:
    return error_response("TIMEOUT", message, 504)


def missing_api_key(message: str = "Missing API Key") -> JSONResponse:
    return error_response("MISSING_API_KEY", message, 400)
