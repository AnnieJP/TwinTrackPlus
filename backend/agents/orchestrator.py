"""
Orchestrator — coordinates TwinTrack's multi-agent pipeline.

The orchestrator is a Python coordinator (not an LLM). It delegates each
LLM-dependent task to the right agent and hands outputs to the next stage.

Pipeline for a simulation request:
  1. Enrichment Agent  → parse NL description into structured IP2 params
  2. Simulation engine → run_simulation(ms, ip1, ip2)  [existing sim_layer.py]
  3. Simulation Agent  → generate plain-English recommendation from OP deltas

Context/sentiment/forecast work happens inside the ML layer (ml/main.py) and
is already orchestrated there — the agents replace only the LLM calls within
that layer (see context.py and sentiment.py).
"""
import sys
import os

_BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_SIM_DIR  = os.path.join(_BACKEND, "sim")
for _p in [_BACKEND, _SIM_DIR]:
    if _p not in sys.path:
        sys.path.insert(0, _p)

from agents.enrichment_agent import extract_nl_parameters
from agents.simulation_agent import generate_recommendation


def run_pipeline(
    twin: dict,
    ip1: dict,
    ip2: dict,
    ms: dict,
    nl_description: str = "",
) -> dict:
    """
    Full orchestration pipeline.

    Args:
        twin:           enrolled business twin_layer dict
        ip1:            current-state IP dict
        ip2:            proposed-scenario IP dict (may be enriched by NL)
        ms:             market snapshot produced by the ML layer
        nl_description: optional free-text from the UI simulation form

    Returns:
        {"op1": ..., "op2": ..., "recommendation": ...}
    """
    from sim_layer import run_simulation

    print("[orchestrator] ── Starting multi-agent pipeline ──────────────────")

    # ── Step 1: Enrichment Agent ─────────────────────────────────────────────
    # If the user typed a natural-language description, extract any explicit
    # parameter overrides and merge them into IP2 before running the simulation.
    if nl_description and nl_description.strip():
        print("[orchestrator] → Enrichment Agent: extracting NL parameters...")
        ip2 = extract_nl_parameters(nl_description, ip2.get("use_case", ""), ip2)

    # ── Step 2: Simulation engine ────────────────────────────────────────────
    # Existing rules-based financial simulator — no LLM involved.
    print("[orchestrator] → Simulation engine: running financial simulation...")
    op = run_simulation(ms, ip1, ip2)

    # ── Step 3: Simulation Agent ─────────────────────────────────────────────
    # Generate a plain-English recommendation grounded in the OP1 → OP2 deltas.
    business_name = str((twin.get("meta") or {}).get("business_name") or "Business")
    print("[orchestrator] → Simulation Agent: generating recommendation...")
    recommendation = generate_recommendation(
        op["op1"], op["op2"], ip2.get("use_case", ""), business_name
    )

    print("[orchestrator] ── Pipeline complete ────────────────────────────────")
    return {
        "op1": op["op1"],
        "op2": op["op2"],
        "recommendation": recommendation,
    }
