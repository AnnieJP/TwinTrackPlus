import warnings
import pandas as pd

warnings.filterwarnings("ignore")

ARIMA_MIN_POINTS = 8  # Minimum data points needed for reliable ARIMA

# Try to import pmdarima for auto tuning, fall back to statsmodels if not installed
try:
    from pmdarima import auto_arima
    AUTO_ARIMA_AVAILABLE = True
    print("[forecaster] pmdarima available — using Auto ARIMA")
except ImportError:
    from statsmodels.tsa.arima.model import ARIMA
    AUTO_ARIMA_AVAILABLE = False
    print("[forecaster] pmdarima not found — using fixed ARIMA(1,1,1)")


def _series_to_df(series: list, freq: str = "M") -> pd.Series:
    """
    Convert list of {date, value} dicts to a pandas Series.
    freq: 'M' for monthly, 'Q' for quarterly
    """
    df = pd.DataFrame(series)
    df["date"] = pd.to_datetime(df["date"])
    df = df.set_index("date").sort_index()
    df = df[~df.index.duplicated(keep="last")]
    series_out = df["value"].astype(float)
    series_out.index = pd.DatetimeIndex(series_out.index).to_period(freq)
    return series_out


def _run_arima(series: pd.Series, horizon: int, series_name: str = "") -> dict:
    """
    Fit best ARIMA model via auto_arima and forecast forward.
    Falls back to ARIMA(1,1,1) if pmdarima not available.

    Returns:
        {
            values: [{date, value}],
            uncertainty_upper: [{date, value}],
            uncertainty_lower: [{date, value}]
        }
    """
    empty = {"values": [], "uncertainty_upper": [], "uncertainty_lower": []}

    if len(series) < ARIMA_MIN_POINTS:
        print(f"[forecaster] Insufficient data ({len(series)} points) for {series_name}, skipping.")
        return empty

    try:
        if AUTO_ARIMA_AVAILABLE:
            # Auto ARIMA — finds best (p,d,q) automatically
            model = auto_arima(
                series,
                start_p=0, max_p=3,
                start_q=0, max_q=3,
                d=None,              # auto-determine differencing
                seasonal=False,      # macro indicators not seasonal in ARIMA sense
                information_criterion="aic",
                stepwise=True,       # faster grid search
                suppress_warnings=True,
                error_action="ignore",
            )
            best_order = model.order
            print(f"[forecaster] {series_name} — best order: {best_order}")

            forecast_obj = model.predict(n_periods=horizon, return_conf_int=True, alpha=0.2)
            mean_vals = forecast_obj[0]
            conf_int  = forecast_obj[1]

            # Generate future period labels
            last_period = series.index[-1]
            future_periods = [last_period + i + 1 for i in range(horizon)]

            values = [{"date": str(p), "value": round(float(v), 4)} for p, v in zip(future_periods, mean_vals)]
            upper  = [{"date": str(p), "value": round(float(v), 4)} for p, v in zip(future_periods, conf_int[:, 1])]
            lower  = [{"date": str(p), "value": round(float(v), 4)} for p, v in zip(future_periods, conf_int[:, 0])]

        else:
            # Fallback — fixed ARIMA(1,1,1)
            from statsmodels.tsa.arima.model import ARIMA as _ARIMA
            model = _ARIMA(series, order=(1, 1, 1))
            fit = model.fit()
            forecast = fit.get_forecast(steps=horizon)

            mean = forecast.predicted_mean
            conf = forecast.conf_int(alpha=0.2)

            values = [{"date": str(d), "value": round(float(v), 4)} for d, v in mean.items()]
            upper  = [{"date": str(d), "value": round(float(v), 4)} for d, v in conf.iloc[:, 1].items()]
            lower  = [{"date": str(d), "value": round(float(v), 4)} for d, v in conf.iloc[:, 0].items()]

        return {"values": values, "uncertainty_upper": upper, "uncertainty_lower": lower}

    except Exception as e:
        print(f"[forecaster] ARIMA failed for {series_name}: {e} — returning empty forecast")
        return empty


def run_forecasts(raw_data: dict, horizon: int) -> dict:
    """
    Run Auto ARIMA on all economic time series from fetched data.

    Args:
        raw_data: output from fetcher.fetch_all()
        horizon:  number of months to forecast forward

    Returns:
        dict of forecasts matching MS schema forecasts block
    """
    print(f"[forecaster] Running Auto ARIMA forecasts for {horizon} months...")

    fred = raw_data.get("fred", {})
    bls  = raw_data.get("bls", {})
    bea  = raw_data.get("bea", {})

    empty = {"values": [], "uncertainty_upper": [], "uncertainty_lower": []}
    forecasts = {}

    # CPI forecast — monthly
    if fred.get("cpi"):
        print("[forecaster] Forecasting CPI...")
        forecasts["cpi_forecast"] = _run_arima(
            _series_to_df(fred["cpi"], freq="M"), horizon, "CPI"
        )
    else:
        forecasts["cpi_forecast"] = empty

    # Interest rate forecast — monthly
    if fred.get("interest_rate"):
        print("[forecaster] Forecasting interest rate...")
        forecasts["interest_rate_forecast"] = _run_arima(
            _series_to_df(fred["interest_rate"], freq="M"), horizon, "Interest Rate"
        )
    else:
        forecasts["interest_rate_forecast"] = empty

    # GDP forecast — quarterly
    if fred.get("gdp"):
        print("[forecaster] Forecasting GDP (quarterly)...")
        gdp_horizon = max(1, horizon // 3)
        forecasts["gdp_forecast"] = _run_arima(
            _series_to_df(fred["gdp"], freq="Q"), gdp_horizon, "GDP"
        )
    else:
        forecasts["gdp_forecast"] = empty

    # Unemployment forecast — monthly
    if bls.get("unemployment"):
        print("[forecaster] Forecasting unemployment...")
        forecasts["unemployment_forecast"] = _run_arima(
            _series_to_df(bls["unemployment"], freq="M"), horizon, "Unemployment"
        )
    else:
        forecasts["unemployment_forecast"] = empty

    # Sector spending forecast — BEA PCE quarterly series
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

    if sector_spending_series:
        print("[forecaster] Forecasting sector spending (quarterly)...")
        spending_horizon = max(1, horizon // 3)
        forecasts["sector_spending_forecast"] = _run_arima(
            _series_to_df(sector_spending_series, freq="Q"),
            spending_horizon,
            "Sector Spending",
        )
    else:
        print("[forecaster] No BEA sector spending data — skipping sector spending forecast.")
        forecasts["sector_spending_forecast"] = empty

    print("[forecaster] All forecasts complete.")
    return forecasts

