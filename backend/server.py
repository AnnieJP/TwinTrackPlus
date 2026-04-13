#!/usr/bin/env python3
"""
TwinTrack enrollment API (stdlib only).

Run from repository root:
    python backend/server.py

POST /api/save-twin-layer
  Body: { "twin_layer": { ... } }  — requires meta.business_id, meta.business_name
  Writes: backend/data/base/input_newbusiness_<date>.json
          (new file each submit; _2, _3 if same name exists)
"""

from __future__ import annotations

import json
import re
import sys
from datetime import date, datetime
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse

BACKEND = Path(__file__).resolve().parent
REPO_ROOT = BACKEND.parent
DATA_DIR = BACKEND / "data"
INPUT_DIR = DATA_DIR / "base"
SIMULATIONS_DIR = DATA_DIR / "simulations"

# Import sim layer
sys.path.insert(0, str(BACKEND / "sim"))
from sim_bridge import twin_layer_to_ip1, ui_sim_to_ip2
from sim_layer import run_simulation, write_op

# Import ML layer
sys.path.insert(0, str(BACKEND / "ml"))
from main import run as ml_run

# Anthropic client for NL enrichment + recommendation
import os
from dotenv import load_dotenv
load_dotenv()
try:
    from anthropic import Anthropic
    _anthropic_client = Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
except Exception:
    _anthropic_client = None


def _enrich_ip2_with_nl(ip2: dict, nl_description: str) -> dict:
    """
    Call Claude Haiku to extract structured parameters from the user's
    natural language description and merge them into the IP2 dict.
    Only overrides keys that are explicitly mentioned in the description.
    """
    if not nl_description or not nl_description.strip() or _anthropic_client is None:
        return ip2

    use_case = ip2.get("use_case", "")
    prompt = f"""Map this natural language business decision to structured parameters.

Use case: {use_case}
Current parameters: {json.dumps(ip2, indent=2)}
User description: "{nl_description.strip()}"

Rules:
- For pricing: extract price_change_pct as a decimal (e.g. "10%" → 0.10, "-5%" → -0.05)
- For audience: extract target_demographic ("18_34"|"35_54"|"55_plus"), marketing_spend_increase as decimal, expected_reach_increase as decimal
- For franchising: extract new_locations (int), investment_per_location (float), expected_revenue_per_location (float)
- Only include keys that are clearly stated in the description
- Keep all other keys from current parameters unchanged

Return ONLY a valid JSON object with the same keys as current parameters. No explanation."""

    try:
        response = _anthropic_client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=300,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = response.content[0].text.strip()
        if raw.startswith("```"):
            lines = raw.split("\n")
            raw = "\n".join(lines[1:-1])
        extracted = json.loads(raw)
        # Merge: only override keys that exist in the original ip2
        merged = {**ip2, **{k: v for k, v in extracted.items() if k in ip2 and v is not None}}
        print(f"[server] NL enrichment applied: {merged}")
        return merged
    except Exception as e:
        print(f"[server] NL enrichment failed ({e}) — using original IP2")
        return ip2


def _generate_recommendation(op1: dict, op2: dict, use_case: str, business_name: str) -> str | None:
    """
    Call Claude Haiku to write a 2-3 sentence business recommendation
    grounded in the OP1 → OP2 delta from the simulation.
    """
    if _anthropic_client is None:
        return None

    f1    = op1.get("financials", {})
    f2    = op2.get("financials", {})
    delta = op2.get("delta", {})
    risk  = op2.get("risk", {})

    rev_delta  = delta.get("revenue_delta", 0)
    prof_delta = delta.get("profit_delta", 0)
    confidence = risk.get("confidence_score", 0)
    sentiment  = risk.get("sentiment_score", 0)

    prompt = f"""You are a financial advisor giving a short, specific recommendation to a small business owner.

Business: {business_name}
Decision type: {use_case.replace("_", " ")}

Simulation results:
- Revenue: ${f1.get('revenue', 0):,.0f} → ${f2.get('revenue', 0):,.0f}  ({rev_delta:+,.0f}/mo)
- Profit:  ${f1.get('profit', 0):,.0f} → ${f2.get('profit', 0):,.0f}  ({prof_delta:+,.0f}/mo)
- Margin:  {f1.get('margin', 0)*100:.1f}% → {f2.get('margin', 0)*100:.1f}%
- Foot traffic: {f1.get('footfall', 0):,.0f} → {f2.get('footfall', 0):,.0f} visits/mo
- Confidence score: {confidence*100:.0f}%
- Market sentiment: {sentiment:.2f}

Write 2-3 sentences. Be direct and specific — cite the numbers. State clearly: proceed, proceed with caution, or avoid. Identify the single most important risk to monitor."""

    try:
        response = _anthropic_client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=250,
            messages=[{"role": "user", "content": prompt}],
        )
        text = response.content[0].text.strip()
        print(f"[server] Recommendation generated ({len(text)} chars)")
        return text
    except Exception as e:
        print(f"[server] Recommendation generation failed: {e}")
        return None


def request_path(handler: BaseHTTPRequestHandler) -> str:
    """
    Normalized URL path for routing.

    Vite (and other proxies) often send absolute-form request-targets, e.g.
    POST http://127.0.0.1:8765/api/save-twin-layer — then handler.path is the
    full URL string, not '/api/...', and strict equality routing returns 404.
    """
    raw = (getattr(handler, "path", None) or "/").strip()
    if "?" in raw:
        raw = raw.split("?", 1)[0]
    if raw.startswith("http://") or raw.startswith("https://"):
        raw = urlparse(raw).path or "/"
    raw = raw.rstrip("/") or "/"
    return raw


def _slug_segment(s: str, max_len: int = 48) -> str:
    t = re.sub(r"[^a-zA-Z0-9._-]+", "_", (s or "").strip())
    t = re.sub(r"_+", "_", t).strip("_")
    return (t[:max_len] if t else "business") or "business"


def _normalize_business_id(raw: object) -> str:
    """Normalize business IDs so copy/paste quirks do not break lookups."""
    txt = str(raw or "")
    txt = txt.replace("\ufeff", "")
    txt = re.sub(r"[\u200b\u200c\u200d]", "", txt)
    return txt.strip().lower()


def next_business_id() -> int:
    """Return next sequential integer business ID from enrollment files."""
    if not INPUT_DIR.is_dir():
        return 1

    max_id = 0
    for p in INPUT_DIR.glob("input_newbusiness_*.json"):
        parsed = _read_enrollment_record(p)
        if parsed is None:
            continue
        _, business_id = parsed
        txt = str(business_id).strip()
        if txt.isdigit():
            max_id = max(max_id, int(txt))
    return max_id + 1


def enrollment_filename(twin: dict) -> str:
    """
    input_newbusiness_<date>.json
    """
    meta = twin.get("meta") or {}
    d_raw = meta.get("date")
    if isinstance(d_raw, str):
        m = re.match(r"^(\d{4}-\d{2}-\d{2})", d_raw.strip())
        date_seg = m.group(1) if m else date.today().isoformat()
    else:
        date_seg = date.today().isoformat()
    date_seg = _slug_segment(date_seg, max_len=10)
    return f"input_newbusiness_{date_seg}.json"


def simulation_filename(use_case: str) -> str:
    """
    input_<usecase>_<date>.json
    """
    date_seg = date.today().isoformat()
    date_seg = _slug_segment(date_seg, max_len=10)
    use_case_slug = _slug_segment(use_case or "simulation", max_len=20)
    return f"input_{use_case_slug}_{date_seg}.json"


def unique_output_path(directory: Path, filename: str) -> Path:
    """If filename exists, use name_2, name_3, ..."""
    candidate = directory / filename
    if not candidate.exists():
        return candidate
    stem = Path(filename).stem
    suffix = Path(filename).suffix
    n = 2
    while True:
        alt = directory / f"{stem}_{n}{suffix}"
        if not alt.exists():
            return alt
        n += 1


# twin_layer_to_ip1 imported from sim_bridge


def write_ip_file(twin: dict, business_id: str) -> str:
    """
    Write just the twin_layer JSON as a clean IP file for the ML layer.
    ML layer (context.py) reads ip["meta"], ip["business_profile"] directly —
    it cannot handle the full enrollment wrapper dict.

    Returns absolute path to written file.
    """
    INPUT_DIR.mkdir(parents=True, exist_ok=True)
    today = date.today().isoformat()
    path = INPUT_DIR / f"ip_{business_id}_{today}.json"
    path.write_text(json.dumps(twin, indent=2), encoding="utf-8")
    return str(path)


def _read_enrollment_record(path: Path) -> tuple[dict, str] | None:
    """Read an enrollment output file and return (twin_layer, business_id)."""
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        twin = data.get("twin_layer")
        if not isinstance(twin, dict) and isinstance(data.get("meta"), dict):
            twin = data
        if not isinstance(twin, dict):
            return None
        business_id = str((twin.get("meta") or {}).get("business_id") or "").strip()
        if not business_id:
            return None
        return twin, business_id
    except Exception:
        return None


def load_twin_layer_for_business(business_id: str) -> dict | None:
    """Search through input_newbusiness_*.json files to find matching business_id."""
    bid = _normalize_business_id(business_id)
    if not bid:
        return None
    if not INPUT_DIR.is_dir():
        return None

    matches: list[tuple[float, dict]] = []
    for p in INPUT_DIR.glob("input_newbusiness_*.json"):
        parsed = _read_enrollment_record(p)
        if parsed is None:
            continue
        twin, business_id = parsed
        if _normalize_business_id(business_id) == bid:
            matches.append((p.stat().st_mtime, twin))
    
    if not matches:
        return None
    matches.sort(key=lambda x: x[0], reverse=True)
    return matches[0][1]


def enrolled_business_ids(limit: int = 8) -> list[str]:
    """Return recent unique enrolled business IDs for error diagnostics."""
    if not INPUT_DIR.is_dir():
        return []

    found: list[tuple[float, str]] = []
    for p in INPUT_DIR.glob("input_newbusiness_*.json"):
        parsed = _read_enrollment_record(p)
        if parsed is None:
            continue
        _, business_id = parsed
        found.append((p.stat().st_mtime, business_id))

    found.sort(key=lambda x: x[0], reverse=True)
    uniq: list[str] = []
    seen: set[str] = set()
    for _, business_id in found:
        key = _normalize_business_id(business_id)
        if key and key not in seen:
            uniq.append(business_id)
            seen.add(key)
        if len(uniq) >= limit:
            break
    return uniq


def list_enrollments(limit: int = 100) -> list[dict]:
    """Return recent enrollment records to drive simulation ID selection in UI."""
    if not INPUT_DIR.is_dir():
        return []

    recs: list[tuple[float, dict]] = []
    for p in INPUT_DIR.glob("input_newbusiness_*.json"):
        parsed = _read_enrollment_record(p)
        if parsed is None:
            continue
        twin, business_id = parsed
        meta = twin.get("meta") or {}
        recs.append((
            p.stat().st_mtime,
            {
                "business_id": business_id,
                "business_name": str(meta.get("business_name") or ""),
                "date": str(meta.get("date") or ""),
                "file": str(p.relative_to(REPO_ROOT)).replace("\\", "/"),
            },
        ))

    recs.sort(key=lambda x: x[0], reverse=True)
    return [r for _, r in recs[:limit]]


def extract_business_id(payload: dict, sim: dict) -> str:
    """Get business id from top-level payload first, then sim payload."""
    raw = payload.get("business_id") or sim.get("businessId") or sim.get("business_id") or ""
    return str(raw).strip()


def extract_use_case(sim: dict) -> str:
    """Get selected use case from simulation payload."""
    raw = sim.get("useCase") or sim.get("use_case") or ""
    return str(raw).strip()


def write_enrollment_json(twin: dict, result: dict) -> str:
    """New file under backend/output/input/ each call; returns repo-relative path."""
    INPUT_DIR.mkdir(parents=True, exist_ok=True)
    path = unique_output_path(INPUT_DIR, enrollment_filename(twin))
    path.write_text(json.dumps(result, indent=2), encoding="utf-8")
    return str(path.relative_to(REPO_ROOT)).replace("\\", "/")


def write_simulation_json(use_case: str, result: dict) -> str:
    """New file under backend/output/simulations/ each call; returns repo-relative path."""
    SIMULATIONS_DIR.mkdir(parents=True, exist_ok=True)
    path = unique_output_path(SIMULATIONS_DIR, simulation_filename(use_case))
    path.write_text(json.dumps(result, indent=2), encoding="utf-8")
    return str(path.relative_to(REPO_ROOT)).replace("\\", "/")


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt: str, *args: object) -> None:
        print("%s - %s" % (self.address_string(), fmt % args))

    def _headers(self, code: int, content_type: str = "application/json") -> None:
        self.send_response(code)
        self.send_header("Content-Type", content_type)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self) -> None:
        path = request_path(self)
        if path == "/api/health":
            self._headers(200)
            self.wfile.write(json.dumps({"ok": True, "service": "twintrack-sim"}).encode("utf-8"))
            return
        if path == "/api/enrollments":
            self._headers(200)
            self.wfile.write(json.dumps({"ok": True, "items": list_enrollments()}).encode("utf-8"))
            return
        self._headers(404)
        self.wfile.write(json.dumps({"error": "not found"}).encode("utf-8"))

    def do_POST(self) -> None:
        raw_path = getattr(self, "path", None)
        path = request_path(self)
        print(f"[POST] Raw path: {raw_path}")
        print(f"[POST] Normalized path: {path}")
        print(f"[POST] Path == '/api/simulate': {path == '/api/simulate'}")
        print(f"[POST] Path == '/api/save-twin-layer': {path == '/api/save-twin-layer'}")
        if path not in ("/api/save-twin-layer", "/api/update-twin-layer", "/api/simulate"):
            print(f"[POST] Path not recognized, returning 404")
            self._headers(404)
            self.wfile.write(json.dumps({"error": "not found"}).encode("utf-8"))
            return

        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length).decode("utf-8") if length else "{}"
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError as e:
            self._headers(400)
            self.wfile.write(json.dumps({"error": "invalid json", "detail": str(e)}).encode("utf-8"))
            return

        if path == "/api/save-twin-layer":
            twin = payload.get("twin_layer")
            if not (isinstance(twin, dict) and twin.get("meta")):
                self._headers(400)
                self.wfile.write(json.dumps({"error": "twin_layer with meta is required"}).encode("utf-8"))
                return
            meta = twin.get("meta") or {}

            assigned_id = next_business_id()
            meta["business_id"] = str(assigned_id)
            meta["type"] = "base"
            twin["meta"] = meta
            
            ip1 = twin_layer_to_ip1(twin)
            result = {
                "twin_layer": twin,
                "sim": None,
                "ip1": ip1,
                "ip2": None,
                "output": None,
            }
            saved_to = write_enrollment_json(twin, result)
            self._headers(200)
            self.wfile.write(json.dumps({"ok": True, "saved_to": saved_to, "result": result}).encode("utf-8"))
            return

        # Handle /api/update-twin-layer
        if path == "/api/update-twin-layer":
            business_id   = str(payload.get("business_id") or "").strip()
            effective_date = str(payload.get("effective_date") or date.today().isoformat()).strip()
            delta_notes   = str(payload.get("delta_notes") or "").strip()
            optional      = payload.get("optional_metrics") or {}
            revenue_current = optional.get("revenue_current")
            costs_current   = optional.get("costs_current")

            if not business_id:
                self._headers(400)
                self.wfile.write(json.dumps({"error": "business_id is required"}).encode("utf-8"))
                return

            twin = load_twin_layer_for_business(business_id)
            if twin is None:
                self._headers(404)
                self.wfile.write(json.dumps({
                    "error": f"No enrolled business found for business_id '{business_id}'",
                    "available_business_ids": enrolled_business_ids(),
                }).encode("utf-8"))
                return

            import copy
            twin = copy.deepcopy(twin)

            # Apply revenue update (owner provides monthly figure)
            if revenue_current is not None:
                try:
                    twin.setdefault("revenue", {})["total_annual"] = round(float(revenue_current) * 12, 2)
                except (TypeError, ValueError):
                    pass

            # Apply costs update — scale existing line items proportionally
            if costs_current is not None:
                try:
                    costs_current = float(costs_current)
                    c     = twin.get("costs") or {}
                    staff = twin.get("staffing") or {}
                    line_items = [
                        float(c.get("monthly_rent")       or 0),
                        float(c.get("monthly_utilities")  or 0),
                        float(c.get("monthly_supplies")   or 0),
                        float(staff.get("monthly_wage_bill") or 0),
                        float((c.get("loan") or {}).get("monthly_repayment") or 0),
                    ]
                    current_total = sum(line_items)
                    if current_total > 0:
                        scale = costs_current / current_total
                        twin["costs"]["monthly_rent"]      = round(line_items[0] * scale, 2)
                        twin["costs"]["monthly_utilities"] = round(line_items[1] * scale, 2)
                        twin["costs"]["monthly_supplies"]  = round(line_items[2] * scale, 2)
                        twin.setdefault("staffing", {})["monthly_wage_bill"] = round(line_items[3] * scale, 2)
                        if "loan" in twin.get("costs", {}):
                            twin["costs"]["loan"]["monthly_repayment"] = round(line_items[4] * scale, 2)
                except (TypeError, ValueError):
                    pass

            # Bump version and stamp effective date + notes
            meta = twin.get("meta") or {}
            new_version = int(meta.get("version") or 1) + 1
            meta["version"]      = new_version
            meta["date"]         = effective_date
            meta["update_notes"] = delta_notes
            meta["type"]         = "base"
            twin["meta"]         = meta

            # Recompute IP1 with updated financials
            ip1 = twin_layer_to_ip1(twin)
            result = {"twin_layer": twin, "sim": None, "ip1": ip1, "ip2": None, "output": None}

            # Write versioned file: input_newbusiness_<id>_v<N>_<date>.json
            INPUT_DIR.mkdir(parents=True, exist_ok=True)
            filename = f"input_newbusiness_{_slug_segment(business_id)}_v{new_version}_{_slug_segment(effective_date, 10)}.json"
            path_out = unique_output_path(INPUT_DIR, filename)
            path_out.write_text(json.dumps(result, indent=2), encoding="utf-8")
            saved_to = str(path_out.relative_to(REPO_ROOT)).replace("\\", "/")

            print(f"[update] Business {business_id} → v{new_version} saved to {saved_to}")
            self._headers(200)
            self.wfile.write(json.dumps({
                "ok": True, "saved_to": saved_to, "version": new_version, "result": result,
            }).encode("utf-8"))
            return

        # Handle /api/simulate
        try:
            sim = payload.get("sim") or {}
            business_id = extract_business_id(payload, sim)
            use_case = extract_use_case(sim)

            if not business_id:
                self._headers(400)
                self.wfile.write(json.dumps({
                    "error": "business_id is required and must match an enrolled business in backend/output/input_newbusiness_*.json"
                }).encode("utf-8"))
                return

            if not use_case:
                self._headers(400)
                self.wfile.write(json.dumps({"error": "sim.useCase is required"}).encode("utf-8"))
                return
            
            print(f"[SIMULATE] business_id={business_id}, use_case={use_case}")
            
            # Always load from an enrolled input_newbusiness_*.json record.
            twin = load_twin_layer_for_business(business_id)
            print(f"[SIMULATE] Loaded twin from business_id: {twin is not None}")
            if twin is None:
                candidates = enrolled_business_ids()
                self._headers(404)
                self.wfile.write(json.dumps({
                    "error": f"No enrolled business found for business_id '{business_id}'. Create/save an enrollment first (input_newbusiness_<date>.json).",
                    "available_business_ids": candidates,
                }).encode("utf-8"))
                return
            
            # Mark twin as experiment
            twin_meta = twin.get("meta") or {}
            twin_meta["type"] = "experiment"
            twin["meta"] = twin_meta

            # Derive IP1 and IP2 via sim_bridge
            ip1 = twin_layer_to_ip1(twin) if isinstance(twin, dict) and twin.get("meta") else None
            ip2 = ui_sim_to_ip2(sim, ip1["monthly_revenue"] if ip1 else 0.0)

            # NL enrichment — merge user description into IP2 if provided
            nl_description = str(sim.get("nlDescription") or "").strip()
            if nl_description:
                print(f"[SIMULATE] NL enrichment: '{nl_description[:80]}'")
                ip2 = _enrich_ip2_with_nl(ip2, nl_description)

            # ── Step 1: Write clean IP file for ML layer ──────────────────
            ip_path = write_ip_file(twin, business_id)
            print(f"[SIMULATE] IP file written: {ip_path}")

            # ── Step 2: Run ML layer → produces MS file ───────────────────
            print(f"[SIMULATE] Running ML layer...")
            ms_path = ml_run(ip_path)
            print(f"[SIMULATE] MS file: {ms_path}")

            # ── Step 3: Load MS ───────────────────────────────────────────
            with open(ms_path, "r", encoding="utf-8") as f:
                ms = json.load(f)

            # ── Step 4: Run sim layer → produces OP1 + OP2 ───────────────
            print(f"[SIMULATE] Running sim layer...")
            op = run_simulation(ms, ip1, ip2)

            # ── Step 5: Save OP file ──────────────────────────────────────
            op_path = write_op(op, ip2["use_case"], business_id)
            print(f"[SIMULATE] OP file: {op_path}")

            # ── Step 6: Generate LLM recommendation ───────────────────────
            business_name = str((twin.get("meta") or {}).get("business_name") or "Business")
            print(f"[SIMULATE] Generating recommendation...")
            recommendation = _generate_recommendation(op["op1"], op["op2"], ip2["use_case"], business_name)

            self._headers(200)
            self.wfile.write(json.dumps({
                "ok": True,
                "op_path": op_path,
                "result": {
                    "op1": op["op1"],
                    "op2": op["op2"],
                    "business_id": business_id,
                    "business_name": business_name,
                    "use_case": ip2["use_case"],
                    "recommendation": recommendation,
                },
            }).encode("utf-8"))
        except Exception as e:
            print(f"[SIMULATE ERROR] {e}")
            import traceback
            traceback.print_exc()
            self._headers(500)
            self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))


def main() -> None:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    print("TwinTrack enrollment API")
    print(f"  http://127.0.0.1:{port}/api/health")
    print(f"  POST http://127.0.0.1:{port}/api/save-twin-layer")
    print(f"  POST http://127.0.0.1:{port}/api/simulate")
    print(f"  enrollment -> data/base/input_newbusiness_<date>.json")
    print(f"  simulation -> data/simulations/input_<usecase>_<date>.json")
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()


if __name__ == "__main__":
    main()
