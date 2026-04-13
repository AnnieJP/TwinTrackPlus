import os
import json
import glob
from datetime import date

_ML_DIR   = os.path.dirname(os.path.abspath(__file__))
_DATA_DIR = os.path.join(_ML_DIR, "..", "data")
CACHE_DIR = os.path.normpath(os.path.join(_DATA_DIR, "cache"))

# All API caches go into the same flat cache directory
CACHE_DIRS = {
    "fred":     CACHE_DIR,
    "bls":      CACHE_DIR,
    "bea":      CACHE_DIR,
    "census":   CACHE_DIR,
    "newsdata": CACHE_DIR,
}


def _today() -> str:
    """Return today's date as ISO string — computed fresh each call."""
    return date.today().isoformat()


def _cache_path(api_name: str, suffix: str = "") -> str:
    """
    Return expected cache file path for today.
    suffix — optional context key (e.g. MSA code, NAICS, business category)
    so that business-specific APIs don't share cache across different businesses.
    """
    directory = CACHE_DIRS[api_name]
    suffix_part = f"_{suffix}" if suffix else ""
    return os.path.join(directory, f"{api_name}{suffix_part}_{_today()}.json")


def exists(api_name: str, suffix: str = "") -> bool:
    """Check if today's cache exists for a given API."""
    return os.path.exists(_cache_path(api_name, suffix))


def load(api_name: str, suffix: str = "") -> dict:
    """Load today's cached data for a given API."""
    path = _cache_path(api_name, suffix)
    if not os.path.exists(path):
        raise FileNotFoundError(f"Cache not found for {api_name} (suffix={suffix!r}) on {_today()}")
    with open(path, "r") as f:
        print(f"[cache] Loaded cache: {path}")
        return json.load(f)


def save(api_name: str, data: dict, suffix: str = "") -> None:
    """Clear old cache files for this API+suffix and save fresh data."""
    directory = CACHE_DIRS[api_name]
    suffix_part = f"_{suffix}" if suffix else ""
    os.makedirs(directory, exist_ok=True)

    # Clear old files for this api+suffix combination only
    old_files = glob.glob(os.path.join(directory, f"{api_name}{suffix_part}_*.json"))
    for old_file in old_files:
        os.remove(old_file)
        print(f"[cache] Cleared old cache: {old_file}")

    path = _cache_path(api_name, suffix)
    with open(path, "w") as f:
        json.dump(data, f, indent=2)
    print(f"[cache] Saved new cache: {path}")


def get_or_fetch(api_name: str, fetch_fn, suffix: str = ""):
    """
    Check cache first. If exists return cached data.
    If not, call fetch_fn(), save result, return it.

    Args:
        api_name:  e.g. "fred", "bls", "census", "newsdata"
        fetch_fn:  zero-arg callable that returns the data dict
        suffix:    context key for business-specific APIs
                   e.g. MSA code for BLS, "msa_naics" for Census,
                   business category for NewsData.
                   Leave empty for global APIs (FRED, BEA).
    """
    if exists(api_name, suffix):
        print(f"[cache] Cache hit for {api_name} (suffix={suffix!r})")
        return load(api_name, suffix)
    else:
        print(f"[cache] Cache miss for {api_name} (suffix={suffix!r}), fetching fresh data...")
        data = fetch_fn()
        save(api_name, data, suffix)
        return data
