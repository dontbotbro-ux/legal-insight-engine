#!/usr/bin/env python3
"""
Email-to-Workflow Intake Agent

Listens for email-style JSON payloads (stdin, one JSON object per line) and
converts each payload into a structured Matter JSON file under ./matters.

Usage examples:
  1) One-shot from a file:
       python3 intake_agent.py --input sample_email.json

  2) Stream mode (NDJSON over stdin):
       cat email_events.ndjson | python3 intake_agent.py

  3) Interactive mode:
       python3 intake_agent.py --stdin
       {"subject":"Urgent: Vendor dispute", "from":"ceo@client.com", "body":"Need counsel..."}
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Optional, Tuple
from uuid import uuid4


MATTERS_DIR = "matters"


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def slugify(value: str) -> str:
    normalized = re.sub(r"[^a-zA-Z0-9]+", "-", (value or "").strip().lower())
    normalized = normalized.strip("-")
    return normalized[:80] if normalized else "untitled"


def ensure_matters_dir() -> str:
    root = os.path.join(os.getcwd(), MATTERS_DIR)
    os.makedirs(root, exist_ok=True)
    return root


def parse_address(value: Any) -> Dict[str, Optional[str]]:
    """Best-effort parse for common email address forms.

    Supported examples:
      - "Jane Doe <jane@example.com>"
      - "jane@example.com"
      - {"name": "Jane Doe", "email": "jane@example.com"}
    """
    if isinstance(value, dict):
        name = value.get("name")
        email = value.get("email")
        return {
            "name": str(name).strip() if name is not None else None,
            "email": str(email).strip().lower() if email is not None else None,
        }

    if isinstance(value, str):
        raw = value.strip()
        m = re.match(r"^(?P<name>.*?)\s*<(?P<email>[^>]+)>$", raw)
        if m:
            return {
                "name": m.group("name").strip() or None,
                "email": m.group("email").strip().lower(),
            }
        if "@" in raw:
            return {"name": None, "email": raw.lower()}
        return {"name": raw or None, "email": None}

    return {"name": None, "email": None}


def parse_address_list(value: Any) -> List[Dict[str, Optional[str]]]:
    if value is None:
        return []
    if isinstance(value, list):
        return [parse_address(v) for v in value]
    return [parse_address(value)]


def extract_keywords(subject: str, body: str) -> List[str]:
    text = f"{subject} {body}".lower()
    vocabulary = [
        "breach",
        "termination",
        "injunction",
        "arbitration",
        "settlement",
        "employment",
        "ip",
        "trademark",
        "copyright",
        "privacy",
        "compliance",
        "investigation",
        "discovery",
        "subpoena",
        "litigation",
        "demand",
    ]
    return sorted([term for term in vocabulary if term in text])


@dataclass
class MatterBuildResult:
    matter_id: str
    file_path: str


def normalize_email_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
    subject = str(payload.get("subject") or payload.get("title") or "New Intake").strip()
    body = str(payload.get("body") or payload.get("text") or payload.get("message") or "").strip()

    sender = parse_address(payload.get("from") or payload.get("sender") or payload.get("author"))
    recipients = parse_address_list(payload.get("to") or payload.get("recipients"))
    cc = parse_address_list(payload.get("cc"))
    bcc = parse_address_list(payload.get("bcc"))

    received_at = payload.get("received_at") or payload.get("date") or payload.get("timestamp") or utc_now_iso()

    attachments = payload.get("attachments")
    if not isinstance(attachments, list):
        attachments = []

    thread_id = str(payload.get("thread_id") or payload.get("conversation_id") or "").strip() or None
    message_id = str(payload.get("message_id") or payload.get("id") or uuid4()).strip()

    tags = payload.get("tags") if isinstance(payload.get("tags"), list) else []
    urgency = str(payload.get("urgency") or payload.get("priority") or "normal").lower().strip()

    return {
        "message_id": message_id,
        "thread_id": thread_id,
        "subject": subject,
        "body": body,
        "from": sender,
        "to": recipients,
        "cc": cc,
        "bcc": bcc,
        "received_at": received_at,
        "attachments": attachments,
        "tags": tags,
        "urgency": urgency,
    }


def build_matter_document(email_obj: Dict[str, Any]) -> Dict[str, Any]:
    normalized = normalize_email_payload(email_obj)
    now = utc_now_iso()

    derived_name = normalized["subject"] or "Matter Intake"
    matter_id = f"matter_{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}_{uuid4().hex[:8]}"

    return {
        "schema_version": "matter.v1",
        "matter_id": matter_id,
        "matter_name": derived_name,
        "status": "intake",
        "created_at": now,
        "updated_at": now,
        "intake": {
            "source": "email_json",
            "email": normalized,
            "summary": {
                "subject": normalized["subject"],
                "urgency": normalized["urgency"],
                "keywords": extract_keywords(normalized["subject"], normalized["body"]),
            },
        },
        "parties": [],
        "attorneys": [],
        "judges": [],
        "claims": [],
        "events": [
            {
                "type": "INTAKE_CREATED",
                "timestamp": now,
                "source": "intake_agent",
                "details": {
                    "message_id": normalized["message_id"],
                    "thread_id": normalized["thread_id"],
                },
            }
        ],
    }


def write_matter_file(matter_doc: Dict[str, Any], directory: str) -> MatterBuildResult:
    matter_id = str(matter_doc["matter_id"])
    matter_name = str(matter_doc.get("matter_name") or "matter")
    safe_name = slugify(matter_name)
    filename = f"{matter_id}_{safe_name}.json"
    path = os.path.join(directory, filename)

    with open(path, "w", encoding="utf-8") as f:
        json.dump(matter_doc, f, indent=2, ensure_ascii=False)
        f.write("\n")

    return MatterBuildResult(matter_id=matter_id, file_path=path)


def process_payload(payload: Dict[str, Any], out_dir: str) -> MatterBuildResult:
    matter = build_matter_document(payload)
    return write_matter_file(matter, out_dir)


def iter_stdin_json() -> Iterable[Tuple[int, Dict[str, Any]]]:
    """Yield (line_no, json_obj) for newline-delimited JSON from stdin."""
    for i, line in enumerate(sys.stdin, start=1):
        stripped = line.strip()
        if not stripped:
            continue
        obj = json.loads(stripped)
        if not isinstance(obj, dict):
            raise ValueError(f"Line {i}: expected JSON object")
        yield i, obj


def run(args: argparse.Namespace) -> int:
    out_dir = ensure_matters_dir()

    try:
        if args.input:
            with open(args.input, "r", encoding="utf-8") as f:
                payload = json.load(f)
            if not isinstance(payload, dict):
                raise ValueError("Input file must contain one JSON object")
            result = process_payload(payload, out_dir)
            print(json.dumps({"ok": True, "matter_id": result.matter_id, "file": result.file_path}))
            return 0

        # Default behavior: read NDJSON objects from stdin.
        if args.stdin or not sys.stdin.isatty():
            processed = 0
            for line_no, payload in iter_stdin_json():
                result = process_payload(payload, out_dir)
                processed += 1
                print(
                    json.dumps(
                        {
                            "ok": True,
                            "line": line_no,
                            "matter_id": result.matter_id,
                            "file": result.file_path,
                        }
                    )
                )
            if processed == 0:
                print(json.dumps({"ok": False, "error": "No JSON payloads read from stdin"}))
                return 1
            return 0

        print("No input provided. Use --input <file.json> or pipe NDJSON via stdin.", file=sys.stderr)
        return 1
    except json.JSONDecodeError as e:
        print(json.dumps({"ok": False, "error": f"Invalid JSON: {e}"}), file=sys.stderr)
        return 2
    except Exception as e:  # pragma: no cover - defensive fallback
        print(json.dumps({"ok": False, "error": str(e)}), file=sys.stderr)
        return 3


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Email-to-Workflow Intake Agent")
    parser.add_argument("--input", help="Path to a single JSON file payload")
    parser.add_argument(
        "--stdin",
        action="store_true",
        help="Read newline-delimited JSON objects from stdin",
    )
    return parser


if __name__ == "__main__":
    sys.exit(run(build_parser().parse_args()))
