import json
import os
from datetime import date

_ML_DIR        = os.path.dirname(os.path.abspath(__file__))
_DATA_DIR      = os.path.normpath(os.path.join(_ML_DIR, "..", "data"))
MS_DIR         = os.path.join(_DATA_DIR, "ms")
OP_DIR         = os.path.join(_DATA_DIR, "op")

# Keep these aliases so main.py imports don't break
BASE_DIR       = MS_DIR
EXPERIMENT_DIR = MS_DIR

from utils import get_latest, get_trend


def build_ms(
    context:     dict,
    raw_data:    dict,
    forecasts:   dict,
    sentiment:   dict,
    elasticity:  dict,
    ip_type:     str = "base",
) -> dict:
    """
    Assemble all ML layer outputs into the locked MS schema.

    Args:
        context:    output from context.py
        raw_data:   output from fetcher.fetch_all()
        forecasts:  output from forecaster.run_forecasts()
        sentiment:  output from sentiment.run_sentiment()
        elasticity: output from elasticity.compute_elasticity()
        ip_type:    "base" or "experiment"

    Returns:
        MS dict matching locked schema
    """
    print("[ms_builder] Assembling MS file...")

    fred   = raw_data.get("fred", {})
    bls    = raw_data.get("bls", {})
    census = raw_data.get("census", {})
    bea    = raw_data.get("bea", {})

    cpi_series          = fred.get("cpi", [])
    interest_series     = fred.get("interest_rate", [])
    gdp_series          = fred.get("gdp", [])
    unemployment_series = bls.get("unemployment", [])
    wage_series         = bls.get("labor_force", [])

    # Parse BEA sector consumer spending
    # BEA returns list of dicts with TimePeriod and DataValue (with commas)
    bea_raw = bea.get("sector_consumer_spending", [])
    try:
        # Filter to LineNumber 1 (total PCE), convert to time series
        sector_spending_series = sorted([
            {
                "date": f"{r['TimePeriod'][:4]}-{str((int(r['TimePeriod'][5]) - 1) * 3 + 1).zfill(2)}-01",
                "value": float(r["DataValue"].replace(",", ""))
            }
            for r in bea_raw
            if r.get("LineNumber") == "1" and r.get("DataValue", "").replace(",", "").isdigit()
        ], key=lambda x: x["date"])
    except Exception:
        sector_spending_series = []

    # Parse Census demographics
    # Response columns (positional): pop, median_income, median_age,
    #   total_hh, <9 below-$50k brackets>, <3 $50k-$100k brackets>,
    #   <4 above-$100k brackets>, geography
    demo_raw = census.get("demographics", [])
    _US_INCOME_FALLBACK = {"below_50k": 0.45, "50k_100k": 0.35, "above_100k": 0.20}
    _US_AGE_FALLBACK    = {"18_34": 0.28, "35_54": 0.36, "55_plus": 0.36}
    try:
        demo_data     = demo_raw[1] if len(demo_raw) > 1 else []
        population    = int(demo_data[0])    if len(demo_data) > 0 else 0
        median_income = int(demo_data[1])    if len(demo_data) > 1 else 0
        median_age    = float(demo_data[2])  if len(demo_data) > 2 else 38.0

        # Income distribution from B19001_* brackets (positions 3-19)
        if len(demo_data) > 19:
            def _hh(pos):
                v = demo_data[pos]
                return int(v) if v not in (None, "", "-") else 0

            total_hh      = _hh(3)
            below_50k_hh  = sum(_hh(i) for i in range(4,  13))   # 9 brackets < $50k
            mid_hh        = sum(_hh(i) for i in range(13, 16))   # 3 brackets $50k-$100k
            above_100k_hh = sum(_hh(i) for i in range(16, 20))   # 4 brackets > $100k

            if total_hh > 0:
                income_dist = {
                    "below_50k":   round(below_50k_hh  / total_hh, 4),
                    "50k_100k":    round(mid_hh         / total_hh, 4),
                    "above_100k":  round(above_100k_hh  / total_hh, 4),
                }
            else:
                income_dist = _US_INCOME_FALLBACK
        else:
            income_dist = _US_INCOME_FALLBACK

        # Age distribution approximated from median age (Census B01002_001E)
        # Younger metros have more 18-34; older metros skew 55+
        if median_age < 34:
            age_dist = {"18_34": 0.36, "35_54": 0.34, "55_plus": 0.30}
        elif median_age < 38:
            age_dist = {"18_34": 0.30, "35_54": 0.36, "55_plus": 0.34}
        elif median_age < 42:
            age_dist = {"18_34": 0.26, "35_54": 0.36, "55_plus": 0.38}
        else:
            age_dist = {"18_34": 0.22, "35_54": 0.34, "55_plus": 0.44}

    except Exception:
        population    = 0
        median_income = 0
        income_dist   = _US_INCOME_FALLBACK
        age_dist      = _US_AGE_FALLBACK

    # Parse Census business density
    cbp_raw = census.get("business_density", [])
    try:
        cbp_data       = cbp_raw[1] if len(cbp_raw) > 1 else []
        establishments = int(cbp_data[0]) if cbp_data else 0
        annual_payroll = int(cbp_data[2]) if cbp_data else 0
    except Exception:
        establishments = 0
        annual_payroll = 0

    ms = {
        "meta": {
            "business_name":           context["business_name"],
            "date":                    date.today().isoformat(),
            "type":                    ip_type,
            "naics_code":              context["naics_code"],
            "msa_code":                context["msa_code"],
            "forecast_horizon_months": context["forecast_horizon_months"],
        },
        "economic_indicators": {
            "cpi": {
                "current":  get_latest(cpi_series),
                "trend":    get_trend(cpi_series),
                "historic": cpi_series,
            },
            "interest_rate": {
                "current":  get_latest(interest_series),
                "trend":    get_trend(interest_series),
                "historic": interest_series,
            },
            "gdp": {
                "current":  get_latest(gdp_series),
                "trend":    get_trend(gdp_series),
                "historic": gdp_series,
            },
            "unemployment": {
                "current":  get_latest(unemployment_series),
                "trend":    get_trend(unemployment_series),
                "historic": unemployment_series,
            },
            "sector_consumer_spending": {
                "current":  get_latest(sector_spending_series),
                "trend":    get_trend(sector_spending_series),
                "historic": sector_spending_series,
            },
            "regional_wage_index": {
                "current":  get_latest(wage_series),
                "trend":    get_trend(wage_series),
                "historic": wage_series,
            },
            "purchasing_power_index": {
                "current": round(median_income / max(get_latest(cpi_series), 1), 4),
                "trend":   "stable",
            },
            "sector_growth_rate": {
                "current": 0.0,
                "trend":   "stable",
            },
        },
        "demographic_data": {
            "target_msa_population":   population,
            "median_household_income": median_income,
            "population_growth_rate":  0.0,
            "age_distribution":        age_dist,
            "income_distribution":     income_dist,
        },
        "market_data": {
            "market_saturation_index": elasticity.get("market_elasticity", 0.5),
            "competitor_density":      establishments,
            "sector_survival_rate":    0.0,
            "average_sector_revenue":  round(annual_payroll / max(establishments, 1), 2),
        },
        "forecasts": {
            "cpi_forecast":           forecasts.get("cpi_forecast",           {"values": [], "uncertainty_upper": [], "uncertainty_lower": []}),
            "unemployment_forecast":  forecasts.get("unemployment_forecast",  {"values": [], "uncertainty_upper": [], "uncertainty_lower": []}),
            "gdp_forecast":           forecasts.get("gdp_forecast",           {"values": [], "uncertainty_upper": [], "uncertainty_lower": []}),
            "sector_spending_forecast": forecasts.get("sector_spending_forecast", {"values": [], "uncertainty_upper": [], "uncertainty_lower": []}),
            "wage_forecast":          {"values": [], "uncertainty_upper": [], "uncertainty_lower": []},
            "purchasing_power_forecast": {"values": [], "uncertainty_upper": [], "uncertainty_lower": []},
        },
        "elasticity_modifiers": {
            "price_elasticity":  elasticity.get("price_elasticity",  1.0),
            "labor_elasticity":  elasticity.get("labor_elasticity",  1.0),
            "demand_elasticity": elasticity.get("demand_elasticity", 0.0),
            "market_elasticity": elasticity.get("market_elasticity", 0.5),
        },
        "news_context": {
            "sentiment_score": sentiment.get("sentiment_score", 0.0),
            "flags":           sentiment.get("flags", []),
        },
    }

    print("[ms_builder] MS schema assembled successfully.")
    return ms


def write_ms(ms: dict, ip_type: str = "base", business_id: str = "unknown", use_case: str = None) -> str:
    """
    Write MS file to backend/data/ms/.

    Naming convention:
        base:       ms_base_<business_id>_<date>.json
        experiment: ms_<use_case>_<business_id>_<date>.json

    Args:
        ms:          assembled MS dict
        ip_type:     "base" or "experiment"
        business_id: business ID from enrollment record
        use_case:    "pricing" | "franchising" | "target_audience" (experiment only)

    Returns:
        Path to written MS file
    """
    today = date.today().isoformat()
    os.makedirs(MS_DIR, exist_ok=True)

    if ip_type == "base":
        path = os.path.join(MS_DIR, f"ms_base_{business_id}_{today}.json")
    else:
        uc = use_case or "exp"
        path = os.path.join(MS_DIR, f"ms_{uc}_{business_id}_{today}.json")

    with open(path, "w") as f:
        json.dump(ms, f, indent=2)

    print(f"[ms_builder] MS file written to: {path}")
    return path
