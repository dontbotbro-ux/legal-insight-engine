#!/usr/bin/env python3
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Dict
from urllib import error, request

from flask import Flask, jsonify, request as flask_request
from flask_cors import CORS

from intake_agent import ensure_matters_dir, process_payload
from transformation_agent import generate_statement_of_claim


OPENCLAW_TELEGRAM_URL = "http://127.0.0.1:18789/proxy/telegram"

app = Flask(__name__)
CORS(app)


def _notify_new_matter(matter_id: str, subject: str, file_path: str) -> Dict[str, Any]:
    payload = {
        "text": (
            "⚖️ New matter filed\n"
            f"Matter ID: {matter_id}\n"
            f"Subject: {subject or 'N/A'}\n"
            f"File: {file_path}"
        )
    }

    data = json.dumps(payload).encode("utf-8")
    req = request.Request(
        OPENCLAW_TELEGRAM_URL,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with request.urlopen(req, timeout=5) as resp:
            body = resp.read().decode("utf-8", errors="replace")
            return {"ok": True, "status": resp.status, "body": body}
    except error.URLError as exc:
        return {"ok": False, "error": str(exc)}


@app.get("/")
def root() -> Any:
    return jsonify(
        {
            "ok": True,
            "service": "intake-api",
            "message": "API is running. Use POST /intake to file a matter.",
            "endpoints": {
                "health": "GET /",
                "intake_help": "GET /intake",
                "intake_submit": "POST /intake",
            },
        }
    )


@app.route("/intake", methods=["GET", "POST"])
def intake() -> Any:
    if flask_request.method == "GET":
        return jsonify(
            {
                "ok": True,
                "message": "Submit JSON payload to POST /intake",
                "example": {
                    "subject": "Urgent Vendor Contract Breach",
                    "from": "client@example.com",
                    "body": "Case details...",
                },
            }
        )

    payload = flask_request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({"ok": False, "error": "Expected JSON object body"}), 400

    # Ensure output directory exists before processing.
    out_dir = ensure_matters_dir()

    try:
        result = process_payload(payload, out_dir)
        notify_result = _notify_new_matter(
            matter_id=result.matter_id,
            subject=str(payload.get("subject") or payload.get("title") or ""),
            file_path=result.file_path,
        )

        return jsonify(
            {
                "ok": True,
                "matter_id": result.matter_id,
                "file": result.file_path,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "notification": notify_result,
            }
        )
    except Exception as exc:  # pragma: no cover
        return jsonify({"ok": False, "error": str(exc)}), 500


@app.route("/claim", methods=["GET", "POST"])
def claim() -> Any:
    if flask_request.method == "GET":
        return jsonify(
            {
                "ok": True,
                "message": "Submit POST /claim with optional matter_file to generate Statement of Claim markdown",
                "example": {
                    "matter_file": "matter_20260306185503_c820888e_connectivity-check.json"
                },
            }
        )

    payload = flask_request.get_json(silent=True) or {}
    if not isinstance(payload, dict):
        return jsonify({"ok": False, "error": "Expected JSON object body"}), 400

    matter_file = payload.get("matter_file")
    if matter_file is not None and not isinstance(matter_file, str):
        return jsonify({"ok": False, "error": "matter_file must be a string when provided"}), 400

    try:
        result = generate_statement_of_claim(matter_file=matter_file)
        return jsonify({"ok": True, **result})
    except FileNotFoundError as exc:
        return jsonify({"ok": False, "error": str(exc)}), 404
    except Exception as exc:  # pragma: no cover
        return jsonify({"ok": False, "error": str(exc)}), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
