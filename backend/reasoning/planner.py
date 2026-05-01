"""
TwinTrack ASP Decision Engine — planner.py

Uses Clingo (Answer Set Programming) to derive a deterministic, auditable
verdict from simulation outputs. The verdict is NOT produced by an LLM —
it is the logical consequence of formal rules applied to financial facts.

Input:  op1 dict, op2 dict, confidence (0–1 float), use_case string
Output: {
    "verdict": "PROCEED" | "PROCEED WITH CAUTION" | "DO NOT PROCEED",
    "signal":  "proceed" | "caution" | "do_not_proceed",
    "reasons": [str, ...]   # human-readable justification labels
}

Falls back to a pure-Python mirror of the same rules if clingo is not installed.
"""
import os

_RULES_FILE = os.path.join(os.path.dirname(__file__), "rules.lp")

_VERDICT_LABELS = {
    "proceed":        "PROCEED",
    "caution":        "PROCEED WITH CAUTION",
    "do_not_proceed": "DO NOT PROCEED",
}

_REASON_LABELS = {
    "profit_improving":        "Profit improves post-decision",
    "profit_declining":        "Profit declines post-decision",
    "confidence_high":         "Model confidence is strong (≥65%)",
    "confidence_moderate":     "Confidence below 65% — projection uncertain",
    "confidence_low":          "Confidence critically low (<45%)",
    "margin_healthy":          "Post-decision margin is healthy (≥15%)",
    "margin_thin":             "Post-decision margin is thin (10–15%)",
    "margin_critical":         "Post-decision margin is critical (<10%)",
    "margin_drop_significant": "Margin drops more than 5pp",
    "break_even_acceptable":   "Break-even within 24 months",
    "break_even_stretched":    "Break-even stretched (24–48 months)",
    "break_even_infeasible":   "Break-even exceeds 48 months",
}


def _build_facts(op1: dict, op2: dict, confidence: float, use_case: str) -> str:
    """Serialise simulation outputs to Clingo fact strings."""
    f1    = op1.get("financials", {})
    f2    = op2.get("financials", {})
    delta = op2.get("delta", {})

    profit_delta   = int(round(delta.get("profit_delta", 0)))
    conf_int       = int(round(confidence * 100))
    margin_pct_int = int(round(f2.get("margin", 0) * 100))
    margin_drop_pp = int(round(
        max(0, (f1.get("margin", 0) - f2.get("margin", 0)) * 100)
    ))
    # 999 signals "not applicable" — the rule ignores B == 999
    break_even_mo  = int(round(f2.get("break_even_months") or 999))
    uc             = use_case.replace("-", "_").lower()

    return "\n".join([
        f"profit_delta({profit_delta}).",
        f"confidence({conf_int}).",
        f"margin_pct({margin_pct_int}).",
        f"margin_drop_pp({margin_drop_pp}).",
        f"break_even_months({break_even_mo}).",
        f"use_case({uc}).",
    ])


def derive_verdict(op1: dict, op2: dict, confidence: float, use_case: str) -> dict:
    """
    Run the ASP rules against simulation outputs and return a structured verdict.

    Tries clingo first; falls back to a Python mirror of the same rules if
    clingo is unavailable (e.g. not installed in the current environment).
    """
    facts = _build_facts(op1, op2, confidence, use_case)
    print(f"[planner] ASP facts:\n{facts}")

    try:
        import clingo  # noqa: PLC0415
        ctl = clingo.Control(["--warn=none"])
        ctl.load(_RULES_FILE)
        ctl.add("base", [], facts)
        ctl.ground([("base", [])])

        verdict_signal: str | None = None
        reason_atoms: list[str]    = []

        with ctl.solve(yield_=True) as handle:
            for model in handle:
                for atom in model.symbols(shown=True):
                    name = atom.name
                    args = atom.arguments
                    if name == "verdict" and args:
                        verdict_signal = str(args[0])
                    elif name == "reason" and args:
                        reason_atoms.append(str(args[0]))

        if verdict_signal is None:
            raise ValueError("Clingo produced no verdict atom")

        label   = _VERDICT_LABELS.get(verdict_signal, "PROCEED WITH CAUTION")
        reasons = [_REASON_LABELS[r] for r in reason_atoms if r in _REASON_LABELS]
        print(f"[planner] Clingo verdict: {label} | {reason_atoms}")
        return {"verdict": label, "signal": verdict_signal, "reasons": reasons}

    except ImportError:
        print("[planner] clingo not installed — using Python fallback rules")
        return _python_fallback(op1, op2, confidence, use_case)
    except Exception as e:
        print(f"[planner] Clingo error ({e}) — using Python fallback rules")
        return _python_fallback(op1, op2, confidence, use_case)


def _python_fallback(op1: dict, op2: dict, confidence: float, use_case: str) -> dict:
    """
    Pure-Python mirror of rules.lp — identical thresholds and logic.
    Used when clingo is unavailable; ensures the engine always produces output.
    """
    f1    = op1.get("financials", {})
    f2    = op2.get("financials", {})
    delta = op2.get("delta", {})

    profit_delta   = delta.get("profit_delta", 0)
    conf_pct       = confidence * 100
    margin_op2     = f2.get("margin", 0) * 100
    margin_drop_pp = max(0, (f1.get("margin", 0) - f2.get("margin", 0)) * 100)
    break_even_mo  = f2.get("break_even_months") or 999

    disqualified = False
    warned       = False
    reasons: list[str] = []

    # Profit direction
    if profit_delta < 0:
        disqualified = True
        reasons.append(_REASON_LABELS["profit_declining"])
    else:
        reasons.append(_REASON_LABELS["profit_improving"])

    # Confidence
    if conf_pct < 45:
        disqualified = True
        reasons.append(_REASON_LABELS["confidence_low"])
    elif conf_pct < 65:
        warned = True
        reasons.append(_REASON_LABELS["confidence_moderate"])
    else:
        reasons.append(_REASON_LABELS["confidence_high"])

    # Margin level
    if margin_op2 < 10:
        disqualified = True
        reasons.append(_REASON_LABELS["margin_critical"])
    elif margin_op2 < 15:
        warned = True
        reasons.append(_REASON_LABELS["margin_thin"])
    else:
        reasons.append(_REASON_LABELS["margin_healthy"])

    # Margin drop
    if margin_drop_pp > 5:
        disqualified = True
        reasons.append(_REASON_LABELS["margin_drop_significant"])

    # Break-even (skip when 999 = not applicable)
    if break_even_mo < 999:
        if break_even_mo > 48:
            disqualified = True
            reasons.append(_REASON_LABELS["break_even_infeasible"])
        elif break_even_mo > 24:
            warned = True
            reasons.append(_REASON_LABELS["break_even_stretched"])
        else:
            reasons.append(_REASON_LABELS["break_even_acceptable"])

    if disqualified:
        signal, label = "do_not_proceed", "DO NOT PROCEED"
    elif warned:
        signal, label = "caution",        "PROCEED WITH CAUTION"
    else:
        signal, label = "proceed",        "PROCEED"

    print(f"[planner] Python fallback verdict: {label}")
    return {"verdict": label, "signal": signal, "reasons": reasons}
