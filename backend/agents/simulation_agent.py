"""
Simulation Agent — resolves target demographics and generates business recommendations.

Tools available to this agent:
  - get_demographic_options: returns the valid demographic bucket keys + descriptions

The agent uses these to map free-text audience descriptions to a structured key,
and also writes plain-English recommendations grounded in simulation numbers.
"""
import json
import sys
import os

_BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _BACKEND not in sys.path:
    sys.path.insert(0, _BACKEND)

from agents.base import run_agent

_VALID_DEMOS = {"18_34", "35_54", "55_plus"}

# ---------------------------------------------------------------------------
# Demographic resolution
# ---------------------------------------------------------------------------
_DEMO_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_demographic_options",
            "description": "Returns the valid demographic segment keys and their age-group descriptions.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    }
]


def _get_demographic_options() -> dict:
    return {
        "options": {
            "18_34": "Young adults aged 18–34 (Gen Z / younger Millennials)",
            "35_54": "Middle-aged adults aged 35–54 (older Millennials / Gen X)",
            "55_plus": "Older adults aged 55 and above (Baby Boomers / Silent Gen)",
        }
    }


_DEMO_TOOL_FUNCTIONS = {"get_demographic_options": _get_demographic_options}

_DEMO_SYSTEM = """You are a market demographics specialist.
Your job: map an audience description to exactly one of three demographic segments.
Call the get_demographic_options tool to see the valid options, then reply with
ONLY the segment key — nothing else. Valid keys: 18_34, 35_54, 55_plus."""


def resolve_demographic(description: str) -> str:
    """
    Simulation Agent entry point for demographic resolution.
    Maps free-text audience description → one of {18_34, 35_54, 55_plus}.
    """
    if not description or not description.strip():
        return "35_54"

    cleaned = description.strip().lower()
    if cleaned in _VALID_DEMOS:
        return cleaned

    print(f"[simulation_agent] Resolving demographic: '{description}'...")

    result = run_agent(
        system_prompt=_DEMO_SYSTEM,
        user_message=(
            f'Audience description: "{description}"\n\n'
            "Call get_demographic_options, then reply with ONLY the matching key."
        ),
        tools=_DEMO_TOOLS,
        tool_functions=_DEMO_TOOL_FUNCTIONS,
    )

    result = (result or "35_54").strip().lower().replace(" ", "_")
    if result in _VALID_DEMOS:
        return result
    for key in _VALID_DEMOS:
        if key in result:
            return key
    return "35_54"


# ---------------------------------------------------------------------------
# Recommendation generation — verdict fixed by ASP, LLM writes prose only
# ---------------------------------------------------------------------------
_REC_SYSTEM_PROSE = """You are a financial advisor writing a concise explanation for a small business owner.
The decision verdict has already been determined by a formal rules engine.
Your only job: write 2 sentences that explain WHY this verdict was reached, citing the key numbers.
Do NOT re-state or change the verdict. Do NOT add caveats beyond what the data shows."""


def generate_recommendation(
    op1: dict,
    op2: dict,
    use_case: str,
    business_name: str,
    asp_verdict: dict | None = None,
) -> str | None:
    """
    Simulation Agent entry point for recommendation generation.

    When asp_verdict is provided (normal path), the verdict string is fixed by
    the ASP decision engine — the LLM only writes the explanatory prose.
    When asp_verdict is absent (fallback), the LLM determines both verdict and prose.
    """
    f1    = op1.get("financials", {})
    f2    = op2.get("financials", {})
    delta = op2.get("delta", {})
    risk  = op2.get("risk", {})

    print(f"[simulation_agent] Generating recommendation for '{business_name}'...")

    if asp_verdict:
        verdict_label = asp_verdict["verdict"]   # PROCEED / PROCEED WITH CAUTION / DO NOT PROCEED
        reasons_text  = "; ".join(asp_verdict.get("reasons", [])[:3])
        result = run_agent(
            system_prompt=_REC_SYSTEM_PROSE,
            user_message=(
                f"Business: {business_name}\n"
                f"Decision type: {use_case.replace('_', ' ')}\n"
                f"Verdict (already fixed): {verdict_label}\n"
                f"Key reasons: {reasons_text}\n\n"
                "Simulation numbers:\n"
                f"  Revenue:    ${f1.get('revenue', 0):,.0f} → ${f2.get('revenue', 0):,.0f}"
                f" ({delta.get('revenue_delta', 0):+,.0f}/mo)\n"
                f"  Profit:     ${f1.get('profit', 0):,.0f} → ${f2.get('profit', 0):,.0f}"
                f" ({delta.get('profit_delta', 0):+,.0f}/mo)\n"
                f"  Margin:     {f1.get('margin', 0)*100:.1f}% → {f2.get('margin', 0)*100:.1f}%\n"
                f"  Confidence: {risk.get('confidence_score', 0)*100:.0f}%\n\n"
                "Write exactly 2 sentences of prose. Do not repeat the verdict label."
            ),
        )
        prose = (result or "").strip()
        text  = f"{verdict_label} — {prose}" if prose else verdict_label
    else:
        result = run_agent(
            system_prompt=(
                "You are a financial advisor. Begin with PROCEED, PROCEED WITH CAUTION, "
                "or DO NOT PROCEED based on the data, then explain in 2 sentences."
            ),
            user_message=(
                f"Business: {business_name}\n"
                f"Decision type: {use_case.replace('_', ' ')}\n\n"
                f"  Revenue:    ${f1.get('revenue', 0):,.0f} → ${f2.get('revenue', 0):,.0f}"
                f" ({delta.get('revenue_delta', 0):+,.0f}/mo)\n"
                f"  Profit:     ${f1.get('profit', 0):,.0f} → ${f2.get('profit', 0):,.0f}"
                f" ({delta.get('profit_delta', 0):+,.0f}/mo)\n"
                f"  Margin:     {f1.get('margin', 0)*100:.1f}% → {f2.get('margin', 0)*100:.1f}%\n"
                f"  Confidence: {risk.get('confidence_score', 0)*100:.0f}%"
            ),
        )
        text = (result or "").strip()

    if text:
        print(f"[simulation_agent] Recommendation generated ({len(text)} chars)")
    return text or None
