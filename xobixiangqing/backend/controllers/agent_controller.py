"""
Agent Controller (Phase 3)

Goal:
- Frontend never calls legacy B directly for chat (no API key exposure).
- Core A proxies to legacy B Smart Agent while injecting unified Settings via headers.

Endpoint:
- POST /api/agent/chat -> proxy to B /api/smart-chat
"""

from __future__ import annotations

import logging
from typing import Any, Dict, Optional

import httpx
from flask import Blueprint, request

from services.legacy_b_client import legacy_b_base_url, legacy_b_headers_from_settings
from utils import error_response, success_response

logger = logging.getLogger(__name__)

agent_bp = Blueprint("agent", __name__, url_prefix="/api/agent")


def _timeout(seconds: float) -> httpx.Timeout:
    s = float(seconds)
    return httpx.Timeout(s, connect=min(5.0, s))


@agent_bp.route("/chat", methods=["POST"])
def agent_chat():
    """
    Proxy to legacy B Smart Agent:
      POST {B}/api/smart-chat

    Body JSON:
      - message: string (required)
      - history: array (optional)
      - context: object (optional)
    """
    try:
        payload = request.get_json(silent=True) or {}
        if not isinstance(payload, dict):
            return error_response("INVALID_REQUEST", "Invalid JSON body", 400)

        message = str(payload.get("message") or "").strip()
        if not message:
            return error_response("INVALID_REQUEST", "Missing message", 400)

        history = payload.get("history")
        if not isinstance(history, list):
            history = []

        context = payload.get("context")
        if context is not None and not isinstance(context, dict):
            context = None

        b_payload: Dict[str, Any] = {
            "message": message,
            "history": history,
            "context": context,
        }

        base = legacy_b_base_url()
        url = f"{base}/api/smart-chat/"
        headers = legacy_b_headers_from_settings()

        with httpx.Client(timeout=_timeout(60.0)) as client:
            res = client.post(url, headers=headers, json=b_payload)
            res.raise_for_status()
            data = res.json()

        if not isinstance(data, dict):
            return error_response("LEGACY_B_ERROR", "Invalid response from legacy B", 502)

        # Expected from B:
        # { response, action?, suggestions?, extracted_info?, data? }
        return success_response(
            {
                "response": data.get("response"),
                "action": data.get("action"),
                "suggestions": data.get("suggestions"),
                "extracted_info": data.get("extracted_info"),
                "data": data.get("data"),
                "raw": data,
            },
            message="ok",
        )

    except httpx.HTTPError as e:
        logger.warning("agent_chat proxy httpx error: %s", e, exc_info=True)
        return error_response("LEGACY_B_UNAVAILABLE", f"Legacy B unavailable: {e}", 502)
    except Exception as e:
        logger.error("agent_chat failed: %s", e, exc_info=True)
        return error_response("SERVER_ERROR", str(e), 500)
