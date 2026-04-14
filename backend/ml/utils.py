import json
import os
from datetime import date


def load_json(path: str) -> dict:
    """Load a JSON file safely."""
    if not os.path.exists(path):
        raise FileNotFoundError(f"File not found: {path}")
    with open(path, "r") as f:
        return json.load(f)


def write_json(path: str, data: dict) -> None:
    """Write a dict to a JSON file."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(data, f, indent=2)


def today() -> str:
    """Return today's date as ISO string."""
    return date.today().isoformat()


def get_latest(series: list) -> float:
    """Get the most recent value from a time series."""
    if not series:
        return 0.0
    return round(float(series[-1]["value"]), 4)


def get_trend(series: list, periods: int = 6) -> str:
    """Determine trend direction from last N periods."""
    if len(series) < 2:
        return "stable"
    recent = series[-periods:] if len(series) >= periods else series
    delta = float(recent[-1]["value"]) - float(recent[0]["value"])
    if delta > 0.5:
        return "rising"
    elif delta < -0.5:
        return "falling"
    return "stable"


def compute_cagr(series: list, freq: str = "Q") -> float:
    """
    Compute annualised compound growth rate from a time series.

    Args:
        series: list of {date, value} dicts sorted ascending
        freq:   "M" (monthly) or "Q" (quarterly) — sets periods per year

    Returns:
        CAGR as a decimal (e.g. 0.032 = 3.2% annual growth).
        Returns 0.0 if series is too short or values are non-positive.
    """
    if len(series) < 2:
        return 0.0
    try:
        v_start = float(series[0]["value"])
        v_end   = float(series[-1]["value"])
        if v_start <= 0 or v_end <= 0:
            return 0.0
        n_periods   = len(series) - 1
        periods_per_year = 12 if freq == "M" else 4
        years       = n_periods / periods_per_year
        if years <= 0:
            return 0.0
        cagr = (v_end / v_start) ** (1.0 / years) - 1.0
        return round(cagr, 6)
    except Exception:
        return 0.0


def validate_ms_schema(ms: dict) -> bool:
    """
    Validate that MS file contains all required top-level keys.
    Returns True if valid, raises ValueError if not.
    """
    required_keys = [
        "meta",
        "economic_indicators",
        "demographic_data",
        "market_data",
        "forecasts",
        "elasticity_modifiers",
        "news_context",
    ]

    missing = [k for k in required_keys if k not in ms]
    if missing:
        raise ValueError(f"MS schema missing required keys: {missing}")

    return True
