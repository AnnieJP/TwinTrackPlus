from utils import get_latest, get_trend


def _compute_price_elasticity(cpi_series: list, sector_spending_series: list) -> float:
    """
    Price elasticity modifier — how sensitive customers are to price changes.

    High YoY CPI growth + falling sector spending = high elasticity (customers push back more)
    Low YoY CPI growth + rising sector spending = low elasticity (customers absorb price changes)

    Returns value between -2.0 and -0.5 (negative by convention).
    sim_layer formula: volume_change = price_elasticity × price_change_pct
    Negative value means rising price → falling demand.
    """
    # Use YoY CPI change rate rather than absolute index level.
    # The absolute FRED CPI value (~314 in 2024) was always above the old threshold
    # of 310, meaning the high-inflation modifier fired on every single simulation.
    if len(cpi_series) >= 12:
        cpi_now      = float(cpi_series[-1]["value"])
        cpi_year_ago = float(cpi_series[-12]["value"])
        cpi_yoy      = (cpi_now - cpi_year_ago) / cpi_year_ago if cpi_year_ago else 0.0
    elif len(cpi_series) >= 2:
        cpi_yoy = (float(cpi_series[-1]["value"]) - float(cpi_series[0]["value"])) / float(cpi_series[0]["value"])
    else:
        cpi_yoy = 0.03  # assume modest inflation if no data

    elasticity = 1.0

    # Inflationary pressure modifier (YoY rate, not absolute index)
    if cpi_yoy > 0.06:      # > 6% — high inflation (e.g. 2022 spike)
        elasticity += 0.5
    elif cpi_yoy > 0.04:    # 4–6% — elevated
        elasticity += 0.3
    elif cpi_yoy > 0.025:   # 2.5–4% — moderate
        elasticity += 0.1
    # < 2.5% = within normal range, no modifier

    # CPI momentum — rising trend signals more pressure ahead
    cpi_trend = get_trend(cpi_series)
    if cpi_trend == "rising":
        elasticity += 0.2
    elif cpi_trend == "falling":
        elasticity -= 0.2

    # Sector spending — if consumers are already cutting back they're more price-sensitive
    spending_trend = get_trend(sector_spending_series)
    if spending_trend == "falling":
        elasticity += 0.2
    elif spending_trend == "rising":
        elasticity -= 0.1

    # Negate — price elasticity of demand is negative by convention
    return round(-max(0.5, min(2.0, elasticity)), 3)


def _compute_labor_elasticity(wage_series: list, unemployment_series: list) -> float:
    """
    Labor elasticity — cost and availability of hiring.

    High wages + low unemployment = expensive and hard to hire
    Low wages + high unemployment = cheap and easy to hire

    Returns value between 0.5 (easy/cheap labor) and 2.0 (hard/expensive labor).
    """
    unemployment = get_latest(unemployment_series)
    wage_trend   = get_trend(wage_series)

    elasticity = 1.0

    # Unemployment modifier — lower unemployment = harder to hire
    if unemployment < 4.0:
        elasticity += 0.4
    elif unemployment < 6.0:
        elasticity += 0.1
    else:
        elasticity -= 0.2

    # Wage trend modifier
    if wage_trend == "rising":
        elasticity += 0.3
    elif wage_trend == "falling":
        elasticity -= 0.2

    return round(max(0.5, min(2.0, elasticity)), 3)


def _compute_demand_elasticity(sector_spending_series: list, gdp_series: list) -> float:
    """
    Demand elasticity — how responsive demand is to economic conditions.

    Rising GDP + rising sector spending = growing demand
    Falling GDP + falling sector spending = contracting demand

    Returns value between -1.0 (contracting) and 1.0 (growing).
    """
    spending_trend = get_trend(sector_spending_series)
    gdp_trend      = get_trend(gdp_series)

    score = 0.0

    if spending_trend == "rising":
        score += 0.4
    elif spending_trend == "falling":
        score -= 0.4

    if gdp_trend == "rising":
        score += 0.3
    elif gdp_trend == "falling":
        score -= 0.3

    return round(max(-1.0, min(1.0, score)), 3)


def _compute_market_elasticity(business_density: dict) -> float:
    """
    Market elasticity — how saturated the national market is for this NAICS sector.

    Sums establishments across all state rows from Census CBP, then normalises
    by US population (≈331M → 3,310 units of 100k) to get a per-100k density.
    This replaces single-state absolute thresholds that had no population context.

    Returns value between 0.0 (low saturation) and 1.0 (high saturation).
    """
    _US_POP_100K = 3_310   # ~331M / 100k

    try:
        rows = business_density.get("business_density", [])
        if len(rows) < 2:
            return 0.5

        # Sum across all state rows (row 0 is the header)
        total = 0
        for row in rows[1:]:
            try:
                val = str(row[0]).replace(",", "").strip() if row else ""
                if val.isdigit():
                    total += int(val)
            except (ValueError, TypeError, IndexError):
                continue

        if total == 0:
            return 0.5

        density_per_100k = total / _US_POP_100K

        # Thresholds calibrated against real NAICS counts:
        #   722515 coffee shops  ≈ 80k  →  ~24/100k  → 0.7
        #   722511 restaurants   ≈ 300k → ~90/100k   → 0.9
        #   713940 gyms          ≈ 40k  → ~12/100k   → 0.5
        #   451211 bookstores    ≈ 10k  → ~3/100k    → 0.3
        if density_per_100k > 50:
            return 0.9
        elif density_per_100k > 20:
            return 0.7
        elif density_per_100k > 8:
            return 0.5
        else:
            return 0.3

    except Exception:
        return 0.5


def compute_elasticity(raw_data: dict) -> dict:
    """
    Compute all elasticity modifiers from fetched economic data.

    Returns:
        {
            price_elasticity,
            labor_elasticity,
            demand_elasticity,
            market_elasticity
        }
    """
    print("[elasticity] Computing elasticity modifiers...")

    fred   = raw_data.get("fred", {})
    bls    = raw_data.get("bls", {})
    census = raw_data.get("census", {})
    bea    = raw_data.get("bea", {})

    cpi_series             = fred.get("cpi", [])
    gdp_series             = fred.get("gdp", [])
    unemployment_series    = bls.get("unemployment", [])
    wage_series            = bls.get("labor_force", [])

    # Parse BEA sector spending same way as ms_builder
    bea_raw = bea.get("sector_consumer_spending", [])
    try:
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

    modifiers = {
        "price_elasticity":  _compute_price_elasticity(cpi_series, sector_spending_series),
        "labor_elasticity":  _compute_labor_elasticity(wage_series, unemployment_series),
        "demand_elasticity": _compute_demand_elasticity(sector_spending_series, gdp_series),
        "market_elasticity": _compute_market_elasticity(census),
    }

    print(f"[elasticity] Modifiers: {modifiers}")
    return modifiers
