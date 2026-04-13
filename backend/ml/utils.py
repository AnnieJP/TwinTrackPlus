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
