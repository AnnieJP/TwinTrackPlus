from utils import get_latest, get_trend


def _compute_price_elasticity(cpi_series: list, sector_spending_series: list) -> float:
    """
    Price elasticity modifier — how sensitive customers are to price changes.

    High CPI + falling sector spending = high elasticity (customers push back more)
    Low CPI + rising sector spending = low elasticity (customers absorb price changes)

    Returns value between -2.0 and -0.5 (negative by convention).
    sim_layer formula: volume_change = price_elasticity × price_change_pct
    Negative value means rising price → falling demand.
    """
    cpi_current = get_latest(cpi_series)
    cpi_trend   = get_trend(cpi_series)

    # Baseline elasticity
    elasticity = 1.0

    # CPI modifier — higher inflation = more price sensitive customers
    if cpi_current > 310:       # High inflation environment
        elasticity += 0.5
    elif cpi_current > 290:     # Moderate inflation
        elasticity += 0.2

    # Trend modifier
    if cpi_trend == "rising":
        elasticity += 0.3
    elif cpi_trend == "falling":
        elasticity -= 0.2

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
    Market elasticity — how saturated the local market is.

    High business density = saturated = harder to capture market share
    Low business density = opportunity = easier to grow

    Returns value between 0.0 (low saturation) and 1.0 (high saturation).
    """
    try:
        # Census CBP returns list — first row is header, second is data
        rows = business_density.get("business_density", [])
        if len(rows) < 2:
            return 0.5  # Default mid-saturation

        data_row = rows[1]
        establishments = int(data_row[0]) if data_row[0] else 0

        # Rough saturation scale based on number of establishments in MSA
        if establishments > 1000:
            return 0.9
        elif establishments > 500:
            return 0.7
        elif establishments > 100:
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
