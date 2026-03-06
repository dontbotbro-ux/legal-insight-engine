#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional
from urllib import error, request


MATTERS_DIR = "matters"
CLAIMS_SUBDIR = "claims"
OPENCLAW_CHAT_URL = os.environ.get(
    "OPENCLAW_CHAT_URL",
    "http://127.0.0.1:18789/v1/chat/completions",
)


def _read_json(path: Path) -> Dict[str, Any]:
    with path.open("r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, dict):
        raise ValueError(f"Matter file must contain a JSON object: {path}")
    return data


def _build_prompt(matter_json: Dict[str, Any], source_name: str) -> str:
    matter_id = matter_json.get("matter_id") or "unknown-matter"
    matter_name = matter_json.get("matter_name") or source_name

    return (
        "You are a senior litigation attorney drafting a formal Statement of Claim in Markdown.\n"
        "Use clear headings and numbered allegations.\n"
        "Include sections: Caption, Parties, Jurisdiction and Venue, Facts, Causes of Action, "
        "Prayer for Relief, and Verification Note.\n"
        "Be conservative, professional, and avoid fabricated facts.\n"
        "When facts are uncertain, explicitly mark them as 'To Be Confirmed'.\n\n"
        f"Matter ID: {matter_id}\n"
        f"Matter Name: {matter_name}\n"
        f"Source File: {source_name}\n\n"
        "Matter JSON:\n"
        f"{json.dumps(matter_json, indent=2, ensure_ascii=False)}\n"
    )


def _call_openclaw(prompt: str) -> str:
    payload = {
        "model": "gpt-4o-mini",
        "temperature": 0.2,
        "messages": [
            {
                "role": "system",
                "content": "Draft high-quality legal documents in precise markdown.",
            },
            {"role": "user", "content": prompt},
        ],
    }

    req = request.Request(
        OPENCLAW_CHAT_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with request.urlopen(req, timeout=60) as resp:
            body = resp.read().decode("utf-8", errors="replace")
            parsed = json.loads(body)
    except error.URLError as exc:
        raise RuntimeError(f"OpenClaw gateway unavailable: {exc}") from exc

    choices = parsed.get("choices") if isinstance(parsed, dict) else None
    if not isinstance(choices, list) or not choices:
        raise RuntimeError("OpenClaw response missing choices")

    message = choices[0].get("message") if isinstance(choices[0], dict) else None
    content = message.get("content") if isinstance(message, dict) else None
    if not isinstance(content, str) or not content.strip():
        raise RuntimeError("OpenClaw response missing markdown content")
    return content.strip()


def _latest_matter_file(matters_dir: Path) -> Optional[Path]:
    files = sorted(
        [p for p in matters_dir.glob("*.json") if p.is_file()],
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    return files[0] if files else None


def generate_statement_of_claim(
    matter_file: Optional[str] = None,
    matters_dir: str = MATTERS_DIR,
) -> Dict[str, str]:
    base_dir = Path(matters_dir)
    base_dir.mkdir(parents=True, exist_ok=True)

    if matter_file:
        candidate = Path(matter_file)
        source_path = candidate if candidate.is_absolute() else (base_dir / candidate)
    else:
        latest = _latest_matter_file(base_dir)
        if latest is None:
            raise FileNotFoundError("No matter JSON files found in matters/ directory")
        source_path = latest

    if not source_path.exists():
        raise FileNotFoundError(f"Matter file not found: {source_path}")

    matter_json = _read_json(source_path)
    prompt = _build_prompt(matter_json, source_path.name)
    markdown = _call_openclaw(prompt)

    claim_dir = base_dir / CLAIMS_SUBDIR
    claim_dir.mkdir(parents=True, exist_ok=True)

    stem = source_path.stem
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    output_name = f"{stem}_statement_of_claim_{timestamp}.md"
    output_path = claim_dir / output_name

    with output_path.open("w", encoding="utf-8") as f:
        f.write(markdown)
        f.write("\n")

    return {
        "matter_file": str(source_path),
        "claim_file": str(output_path),
    }


def _cli() -> int:
    parser = argparse.ArgumentParser(description="Generate Statement of Claim markdown from matter JSON")
    parser.add_argument("--matter-file", help="Matter JSON filename (in matters/) or absolute path")
    args = parser.parse_args()

    result = generate_statement_of_claim(matter_file=args.matter_file)
    print(json.dumps({"ok": True, **result}))
    return 0


if __name__ == "__main__":
    raise SystemExit(_cli())

