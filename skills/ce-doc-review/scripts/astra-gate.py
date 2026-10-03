#!/usr/bin/env python3
"""Decide whether the codex cross-model lineup adds gpt-6-astra for one document.

Asks TypeSafe System One (Jev) the fixed questions in
`references/astra-gate-questions.json` about the document, then applies the
gate rule below in code (never in the model) and writes one record:

    astra-gate.py --plan <document> --out <evidence-dir>/astra-gate.json
                  [--answers <saved-answers.json>]

`--answers` replays a saved Jev response (`{"answers": {...}, "usage": {...}}`
or a bare answers object) instead of calling the API; tests and re-runs use it.

Rule: Astra joins when any of auth_security / payments / privacy is at or above
NOUL_THRESHOLD, or when depth is `deep` and at least DEEP_MIN_NOULS of the six
yes/no questions are at or above NOUL_THRESHOLD.

`CROSS_MODEL_ASTRA=on|off` beats the gate. A missing TYPESAFE_API_KEY, an API
failure, or a malformed response never stops the review: the record says why,
and the lineup stays Luna + Sol unless the override says `on`.

stdout: one line `astra-gate: astra=<yes|no> reason=<...>`. Exit 0 whenever a
record was written; 2 on bad arguments; 1 when the record cannot be written.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

API_URL = "https://api.typesafe.ai/v1/systemone"
JEV_MODEL = "jev-latest"
PRICE_PER_M_INPUT_USD = 0.042  # output tokens are free
REQUEST_TIMEOUT_SECS = 60

NOUL_THRESHOLD = 0.7
HIGH_RISK_KEYS = ("auth_security", "payments", "privacy")
NOUL_KEYS = ("auth_security", "payments", "data_migration", "external_api", "privacy", "multi_surface")
DEEP_CHOICE = "deep"
DEEP_MIN_NOULS = 2

BASE_LINEUP = ["gpt-6-luna", "gpt-6-sol"]
ASTRA_MODEL = "gpt-6-astra"

QUESTIONS_FILE = Path(__file__).resolve().parent.parent / "references" / "astra-gate-questions.json"


class GateUnavailable(Exception):
    """Jev could not give a usable answer; the message is recorded verbatim."""


def decide(answers: dict) -> tuple[bool, str]:
    """Apply the gate rule to validated answers. Returns (astra, reason)."""
    nouls = {k: float(answers[k]["noul"]) for k in NOUL_KEYS}
    high = [k for k in HIGH_RISK_KEYS if nouls[k] >= NOUL_THRESHOLD]
    if high:
        named = ", ".join(f"{k}={nouls[k]:.2f}" for k in high)
        return True, f"high-risk domain at or above {NOUL_THRESHOLD}: {named}"
    depth = answers["depth"]["choice"]
    strong = [k for k in NOUL_KEYS if nouls[k] >= NOUL_THRESHOLD]
    if depth == DEEP_CHOICE and len(strong) >= DEEP_MIN_NOULS:
        named = ", ".join(f"{k}={nouls[k]:.2f}" for k in strong)
        return True, f"depth=deep with {len(strong)} questions at or above {NOUL_THRESHOLD}: {named}"
    strong_text = ", ".join(strong) if strong else "none"
    return False, (
        f"no high-risk domain at or above {NOUL_THRESHOLD}; depth={depth}; "
        f"questions at or above {NOUL_THRESHOLD}: {strong_text}"
    )


def validate_answers(answers: object, questions: dict) -> dict:
    """Check every question came back with the right shape; raise GateUnavailable otherwise."""
    if not isinstance(answers, dict):
        raise GateUnavailable("response has no answers object")
    for key, spec in questions.items():
        got = answers.get(key)
        if not isinstance(got, dict) or got.get("type") != spec["type"]:
            raise GateUnavailable(f"answer '{key}' missing or not type {spec['type']}")
        if spec["type"] == "noul":
            value = got.get("noul")
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not 0 <= value <= 1:
                raise GateUnavailable(f"answer '{key}' has no noul in 0..1")
        elif got.get("choice") not in spec.get("criteria", {}):
            raise GateUnavailable(f"answer '{key}' choice {got.get('choice')!r} is not a listed option")
    return answers


def ask_jev(plan_text: str, questions: dict) -> dict:
    """POST the document and questions to System One; return the parsed response."""
    key = os.environ.get("TYPESAFE_API_KEY", "").strip()
    if not key:
        raise GateUnavailable("TYPESAFE_API_KEY is not set")
    body = json.dumps({"state": {"plan": plan_text}, "model": JEV_MODEL, "questions": questions}).encode()
    request = urllib.request.Request(
        API_URL,
        data=body,
        method="POST",
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT_SECS) as response:
            return json.loads(response.read().decode())
    except urllib.error.HTTPError as error:
        detail = error.read().decode(errors="replace")[:300]
        raise GateUnavailable(f"System One returned HTTP {error.code}: {detail}") from None
    except (urllib.error.URLError, TimeoutError, OSError) as error:
        raise GateUnavailable(f"System One call failed: {error}") from None
    except json.JSONDecodeError as error:
        raise GateUnavailable(f"System One response is not JSON: {error}") from None


def read_override() -> tuple[str | None, str | None]:
    """Return (override, note). An invalid value is ignored and noted, never guessed."""
    raw = os.environ.get("CROSS_MODEL_ASTRA", "").strip().lower()
    if raw in ("", "auto"):
        return None, None
    if raw in ("on", "off"):
        return raw, None
    return None, f"CROSS_MODEL_ASTRA={raw!r} is not on|off; ignored"


def build_record(plan: Path, response: dict | None, error: str | None, status: str, wall_secs: float) -> dict:
    questions = json.loads(QUESTIONS_FILE.read_text())
    answers = None if response is None else response.get("answers")
    usage = None if response is None else response.get("usage")
    gate_astra: bool | None = None
    gate_reason = None
    if error is None:
        try:
            gate_astra, gate_reason = decide(validate_answers(answers, questions))
        except GateUnavailable as bad:
            error, status = str(bad), "unavailable"
    input_tokens = usage.get("input_tokens") if isinstance(usage, dict) else None
    cost = None if not isinstance(input_tokens, int) else round(input_tokens * PRICE_PER_M_INPUT_USD / 1_000_000, 8)

    override, override_note = read_override()
    if override is not None:
        astra = override == "on"
        reason = f"CROSS_MODEL_ASTRA={override} overrides the gate"
        if gate_reason:
            reason += f" (gate said {'yes' if gate_astra else 'no'}: {gate_reason})"
        elif error:
            reason += f" (gate unavailable: {error})"
    elif error is not None:
        astra = False
        reason = f"gate unavailable, continuing with Luna + Sol: {error}"
    else:
        astra = bool(gate_astra)
        reason = gate_reason
    return {
        "plan_path": str(plan),
        "plan_sha256": hashlib.sha256(plan.read_bytes()).hexdigest(),
        "status": status,
        "error": error,
        "model_requested": JEV_MODEL,
        "model": None if response is None else response.get("model"),
        "answers": answers,
        "usage": usage,
        "price_per_m_input_usd": PRICE_PER_M_INPUT_USD,
        "cost_usd": cost,
        "wall_secs": round(wall_secs, 3),
        "rule": {
            "noul_threshold": NOUL_THRESHOLD,
            "high_risk_keys": list(HIGH_RISK_KEYS),
            "deep_choice": DEEP_CHOICE,
            "deep_min_nouls": DEEP_MIN_NOULS,
        },
        "gate_decision": gate_astra,
        "override": override,
        "override_used": override is not None,
        "override_note": override_note,
        "astra": astra,
        "reason": reason,
        "lineup": BASE_LINEUP + ([ASTRA_MODEL] if astra else []),
    }


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--plan", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--answers", type=Path, help="replay a saved Jev response instead of calling the API")
    args = parser.parse_args(argv)
    if not args.plan.is_file():
        print(f"astra-gate: document not readable: {args.plan}", file=sys.stderr)
        return 2

    started = time.monotonic()
    response: dict | None = None
    error: str | None = None
    status = "ok"
    try:
        if args.answers is not None:
            status = "replayed"
            loaded = json.loads(args.answers.read_text())
            response = loaded if "answers" in loaded else {"answers": loaded}
        elif read_override()[0] == "off":
            status, error = "skipped", "CROSS_MODEL_ASTRA=off; Jev not called"
        else:
            questions = json.loads(QUESTIONS_FILE.read_text())
            response = ask_jev(args.plan.read_text(), questions)
    except GateUnavailable as unavailable:
        status, error = "unavailable", str(unavailable)
    except (OSError, json.JSONDecodeError) as bad:
        status, error = "unavailable", f"saved answers unreadable: {bad}"

    record = build_record(args.plan, response, error, status, time.monotonic() - started)
    try:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(json.dumps(record, indent=2) + "\n")
    except OSError as bad:
        print(f"astra-gate: cannot write {args.out}: {bad}", file=sys.stderr)
        return 1
    print(f"astra-gate: astra={'yes' if record['astra'] else 'no'} reason={record['reason']}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
