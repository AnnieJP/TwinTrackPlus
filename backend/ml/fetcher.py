import os
import requests
from datetime import date
from dotenv import load_dotenv
from cache import get_or_fetch

load_dotenv()

FRED_API_KEY    = os.getenv("FRED_API_KEY")
BLS_API_KEY     = os.getenv("BLS_API_KEY")
BEA_API_KEY     = os.getenv("BEA_API_KEY")
CENSUS_API_KEY  = os.getenv("CENSUS_API_KEY")

# -------------------------------------------------------------------
# FRED
# -------------------------------------------------------------------
FRED_SERIES = {
    "cpi":           "CPIAUCSL",   # Consumer Price Index
    "interest_rate": "FEDFUNDS",   # Federal Funds Rate
    "gdp":           "GDP",        # Gross Domestic Product
}

def _fetch_fred_series(series_id: str, observation_start: str = "2021-01-01") -> list:
    """Fetch a single FRED time series."""
    url = "https://api.stlouisfed.org/fred/series/observations"
    params = {
        "series_id": series_id,
        "api_key": FRED_API_KEY,
        "file_type": "json",
        "observation_start": observation_start,
        "sort_order": "asc",
    }
    response = requests.get(url, params=params)
    response.raise_for_status()
    observations = response.json().get("observations", [])
    return [{"date": o["date"], "value": float(o["value"])} for o in observations if o["value"] != "."]


def fetch_fred(context: dict) -> dict:
    """Fetch all FRED series. Falls back to empty lists on any API error."""
    def _fetch():
        data = {}
        for key, series_id in FRED_SERIES.items():
            print(f"[fetcher] FRED → {key} ({series_id})")
            try:
                data[key] = _fetch_fred_series(series_id)
            except Exception as e:
                print(f"[fetcher] FRED {series_id} failed ({e}) — using empty series.")
                data[key] = []
        return data
    return get_or_fetch("fred", _fetch)


# -------------------------------------------------------------------
# BLS
# -------------------------------------------------------------------
def fetch_bls(context: dict) -> dict:
    """Fetch BLS unemployment and wage data scoped by MSA + NAICS."""
    def _fetch():
        headers = {"Content-type": "application/json"}
        msa_code = context["msa_code"]
        naics_code = context["naics_code"]

        # BLS LAU uses its own area codes — different from Census MSA codes
        # Format: LAUMT + BLS area code (7 chars) + measure (2 chars) = 14 chars total
        # BLS area codes for major metros
        # Load BLS area codes from la_area.txt file
        # MSA entries have area_type_code 'B' and area_code format MT + FIPS + zeros
        # We match Census MSA codes (e.g. 19100) to BLS area codes via FIPS
        import os

        la_area_path = os.path.join(os.path.dirname(__file__), "la_area.txt")
        bls_area_code = None

        if os.path.exists(la_area_path):
            with open(la_area_path, "r") as f:
                for line in f:
                    parts = line.strip().split("\t")
                    if len(parts) < 3:
                        continue
                    area_type = parts[0]
                    area_code = parts[1]
                    # MSA entries: type B, area_code starts with MT
                    # MT + 2-digit state FIPS + 5-digit MSA code + zeros
                    # Census MSA code is last 5 digits of the FIPS portion
                    if area_type == "B" and area_code.startswith("MT"):
                        # Extract the MSA portion: MT + 2-state + 5-msa = MT48191...
                        # Census MSA code 19100 maps to FIPS MSA 19100
                        fips_portion = area_code[2:9]  # 7 digits after MT
                        census_msa = fips_portion[2:]   # last 5 digits = MSA code
                        if census_msa == msa_code:
                            bls_area_code = area_code
                            print(f"[bls] Found BLS area code: {bls_area_code}")
                            break
        else:
            print(f"[bls] la_area.txt not found at {la_area_path} — skipping BLS fetch.")

        if not bls_area_code:
            print(f"[bls] No BLS area code found for MSA {msa_code} — skipping BLS fetch.")
            return {"unemployment": [], "labor_force": [], "naics_code": naics_code, "msa_code": msa_code}

        # BLS LAU series format: LAU + full area_code from la_area.txt + 2-digit measure
        # e.g. Dallas: LAU + MT4819100000000 + 03 = LAUMT481910000000003
        series_ids = [
            f"LAU{bls_area_code}03",   # Unemployment rate
            f"LAU{bls_area_code}06",   # Labor force
        ]

        payload = {
            "seriesid": series_ids,
            "startyear": "2021",
            "endyear": str(date.today().year),
            "registrationkey": BLS_API_KEY,
        }

        response = requests.post(
            "https://api.bls.gov/publicAPI/v2/timeseries/data/",
            json=payload,
            headers=headers,
        )
        response.raise_for_status()
        result = response.json()

        data = {}
        for series in result.get("Results", {}).get("series", []):
            sid = series["seriesID"]
            observations = [
                {
                    "date": f"{d['year']}-{d['period'].replace('M', '').zfill(2)}-01",
                    "value": float(d["value"])
                }
                for d in series["data"]
                if d["value"] not in ("-", "")
            ]
            data[sid] = sorted(observations, key=lambda x: x["date"])

        return {
            "unemployment": data.get(series_ids[0], []),
            "labor_force":  data.get(series_ids[1], []),
            "naics_code":   naics_code,
            "msa_code":     msa_code,
        }

    return get_or_fetch("bls", _fetch, suffix=context["msa_code"])


# -------------------------------------------------------------------
# BEA
# -------------------------------------------------------------------
def fetch_bea(context: dict) -> dict:
    """Fetch BEA personal consumption expenditure by sector."""
    def _fetch():
        url = "https://apps.bea.gov/api/data"
        current_year = date.today().year
        bea_years = ",".join(str(y) for y in range(2021, current_year + 1))
        params = {
            "UserID":       BEA_API_KEY,
            "method":       "GetData",
            "DataSetName":  "NIPA",
            "TableName":    "T20405",
            "Frequency":    "Q",
            "Year":         bea_years,
            "ResultFormat": "JSON",
        }
        try:
            response = requests.get(url, params=params, timeout=15)
            response.raise_for_status()
            raw = response.json()
            data = raw.get("BEAAPI", {}).get("Results", {}).get("Data", [])
        except Exception as e:
            print(f"[fetcher] BEA call failed ({e}) — using empty data.")
            data = []
        return {"sector_consumer_spending": data}

    return get_or_fetch("bea", _fetch)


# -------------------------------------------------------------------
# Census
# -------------------------------------------------------------------
def fetch_census(context: dict) -> dict:
    """Fetch Census demographic and business density data by MSA."""
    def _fetch():
        msa_code = context["msa_code"]
        naics_code = context["naics_code"][:2]  # 2-digit sector code

        # American Community Survey - demographic data
        acs_url = "https://api.census.gov/data/2023/acs/acs5"
        acs_params = {
            # B01003_001E = total population
            # B19013_001E = median household income
            # B01002_001E = median age
            # B19001_001E = total households (denominator for income distribution)
            # B19001_002E..010E = income brackets below $50k
            # B19001_011E..013E = income brackets $50k-$100k
            # B19001_014E..017E = income brackets above $100k
            "get": (
                "B01003_001E,B19013_001E,B01002_001E,"
                "B19001_001E,B19001_002E,B19001_003E,B19001_004E,B19001_005E,"
                "B19001_006E,B19001_007E,B19001_008E,B19001_009E,B19001_010E,"
                "B19001_011E,B19001_012E,B19001_013E,"
                "B19001_014E,B19001_015E,B19001_016E,B19001_017E"
            ),
            "for": f"metropolitan statistical area/micropolitan statistical area:{msa_code}",
            "key": CENSUS_API_KEY,
        }
        try:
            acs_response = requests.get(acs_url, params=acs_params)
            acs_response.raise_for_status()
            acs_text = acs_response.text.strip()
            acs_data = acs_response.json() if acs_text else []
        except Exception as e:
            print(f"[fetcher] Census ACS call failed: {e} — using empty demographics.")
            acs_data = []

        # Business density - County Business Patterns
        # CBP national level filtered by NAICS sector
        cbp_url = "https://api.census.gov/data/2021/cbp"
        cbp_params = {
            "get":       "ESTAB,EMP,PAYANN",
            "for":       "state:*",          # State level — more reliable than us:*
            "NAICS2017": naics_code,
            "key":       CENSUS_API_KEY,
        }
        try:
            cbp_response = requests.get(cbp_url, params=cbp_params)
            cbp_response.raise_for_status()
            cbp_text = cbp_response.text.strip()
            cbp_data = cbp_response.json() if cbp_text else []
        except Exception as e:
            print(f"[fetcher] Census CBP call failed: {e} — using empty business density.")
            cbp_data = []

        return {
            "demographics":    acs_data,
            "business_density": cbp_data,
            "msa_code":        msa_code,
            "naics_code":      naics_code,
        }

    suffix = f"{context['msa_code']}_{context['naics_code'][:2]}"
    return get_or_fetch("census", _fetch, suffix=suffix)


# -------------------------------------------------------------------
# NewsData.io
# -------------------------------------------------------------------
NEWSDATA_API_KEY = os.getenv("NEWSDATA_API_KEY")


# NAICS code → specific search terms that produce relevant news
_NAICS_SEARCH_TERMS: dict[str, str] = {
    "722515": "coffee cafe beverage",
    "722511": "restaurant food dining",
    "722513": "fast food restaurant",
    "722514": "catering food service",
    "722410": "bar tavern nightlife",
    "311811": "bakery bread pastry",
    "448140": "clothing apparel retail",
    "448110": "clothing fashion retail",
    "448210": "shoe footwear retail",
    "812112": "hair salon beauty",
    "812111": "barbershop grooming",
    "812113": "nail salon beauty",
    "713940": "gym fitness wellness",
    "453110": "florist flowers",
    "445110": "grocery food supermarket",
    "445131": "convenience store",
    "453220": "gift shop retail",
    "448310": "jewelry retail",
    "451211": "bookstore retail",
    "453910": "pet store",
    "446110": "pharmacy drugstore",
    "444110": "hardware home improvement",
    "442110": "furniture home retail",
    "452319": "retail consumer spending",
}

# Stop words to strip from NAICS labels when no NAICS mapping exists
_LABEL_STOPWORDS = {"and", "&", "the", "of", "or", "for", "a", "an", "bars", "stores", "store", "shops", "shop", "services"}


def _simplified_category(business_type: str) -> str:
    """
    Reduce a full NAICS label to 1-2 searchable words, skipping stopwords/symbols.
    "Snack & beverage bars"     → "snack beverage"
    "Full-service restaurants"  → "full service"
    "Bakery / baked goods"      → "bakery baked"
    """
    bt = business_type.lower().split("/")[0].split("-")[0].strip()
    words = [w for w in bt.split() if w not in _LABEL_STOPWORDS][:2]
    return " ".join(words) if words else "retail"


def _news_search_term(context: dict) -> str:
    """
    Return the best search term for this business context.
    Prefers the NAICS-keyed mapping; falls back to cleaned label words.
    """
    naics = context.get("naics_code", "")
    if naics in _NAICS_SEARCH_TERMS:
        return _NAICS_SEARCH_TERMS[naics]
    return _simplified_category(context.get("business_type", "retail"))


def fetch_news(context: dict) -> dict:
    """
    Fetch news articles relevant to the business type.
    Uses progressive fallback queries — from specific to broad —
    so a tight NAICS label that returns 0 results doesn't silence the feed.
    """
    def _fetch():
        url = "https://newsdata.io/api/1/latest"
        category = _news_search_term(context)

        # Progressively broader queries — stop at first non-empty result
        queries = [
            f"{category} small business",
            f"{category} economy consumer",
            "small business retail economy consumer spending",
            "small business economy inflation consumer",
        ]

        articles = []
        for query in queries:
            params = {
                "apikey":   NEWSDATA_API_KEY,
                "q":        query,
                "language": "en",
                "country":  "us",
            }
            try:
                response = requests.get(url, params=params, timeout=12)
                response.raise_for_status()
                articles = response.json().get("results", [])
                if articles:
                    print(f"[fetcher] NewsData → {len(articles)} articles on: '{query}'")
                    break
                else:
                    print(f"[fetcher] NewsData → 0 results for '{query}', trying broader...")
            except Exception as e:
                print(f"[fetcher] NewsData call failed: {e} — using empty news.")
                break

        if not articles:
            print("[fetcher] NewsData → no articles across all queries.")

        return {
            "articles": [
                {
                    "title":       a.get("title", ""),
                    "description": a.get("description", ""),
                    "pubDate":     a.get("pubDate", ""),
                    "sentiment":   a.get("sentiment", ""),
                }
                for a in articles
            ]
        }

    suffix = _news_search_term(context).split()[0]  # e.g. "coffee" from "coffee cafe beverage"
    return get_or_fetch("newsdata", _fetch, suffix=suffix)


# -------------------------------------------------------------------
# Master fetch function
# -------------------------------------------------------------------
def fetch_all(context: dict) -> dict:
    """Run all API fetches and return combined raw data."""
    print("[fetcher] Starting all API fetches...")
    return {
        "fred":    fetch_fred(context),
        "bls":     fetch_bls(context),
        "bea":     fetch_bea(context),
        "census":  fetch_census(context),
        "news":    fetch_news(context),
    }
