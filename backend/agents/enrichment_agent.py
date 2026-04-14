"""
Enrichment Agent — extracts structured simulation parameters from natural language.

No tools needed: the agent reasons directly from the NL description and merges
extracted values into the existing IP2 parameter dict.
"""
import json
import sys
import os

_BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _BACKEND not in sys.path:
    sys.path.insert(0, _BACKEND)

from agents.base import run_agent

_SYSTEM = """You are a parameter extraction assistant for a business simulation platform.
A small business owner has described their decision in plain English.
Extract only the parameters explicitly mentioned and return the updated parameter dict.
Return ONLY a valid JSON object — no explanation, no markdown."""


def extract_nl_parameters(nl_description: str, use_case: str, current_params: dict) -> dict:
    """
    Enrichment Agent entry point.

    Parses the owner's natural language description and merges any explicitly
    mentioned values into current_params. Keys not mentioned are left unchanged.

    Args:
        nl_description: free-text from the UI (e.g. "I want to raise prices by 10%")
        use_case:        "pricing" | "target_audience" | "franchising"
        current_params:  existing IP2 dict (form values already filled in)

    Returns:
        Merged IP2 dict (original dict if extraction fails or NL is empty).
    """
    if not nl_description or not nl_description.strip():
        return current_params

    print(f"[enrichment_agent] Extracting params from: '{nl_description[:80]}'...")

    result = run_agent(
        system_prompt=_SYSTEM,
        user_message=(
            f"Use case: {use_case}\n"
            f"Current parameters:\n{json.dumps(current_params, indent=2)}\n"
            f'User description: "{nl_description.strip()}"\n\n'
            "Extraction rules:\n"
            "- pricing:    price_change_pct as decimal (e.g. '10%' → 0.10, '-5%' → -0.05)\n"
            "- audience:   target_demographic ('18_34'|'35_54'|'55_plus'),\n"
            "              marketing_spend_increase as decimal,\n"
            "              expected_reach_increase as decimal\n"
            "- franchising: new_locations (int), investment_per_location (float),\n"
            "               expected_revenue_per_location (float)\n"
            "Only include keys that are clearly stated in the description.\n"
            "Keep all other keys from current parameters unchanged.\n\n"
            "Return ONLY a JSON object with the same keys as current parameters."
        ),
    )

    try:
        raw = (result or "").strip()
        if "```" in raw:
            raw = raw.split("```")[1].lstrip("json").strip()
        extracted = json.loads(raw)
        # Only override keys that already exist in current_params and were explicitly extracted
        merged = {
            **current_params,
            **{k: v for k, v in extracted.items() if k in current_params and v is not None},
        }
        print(f"[enrichment_agent] Merged params: {merged}")
        return merged
    except Exception as e:
        print(f"[enrichment_agent] Parse failed ({e}) — using original params")
        return current_params
