# TwinTrack — Digital Twin Economic Simulator

> **WEHack UTD · Capital One Track**
> Model pricing shifts, franchise expansion, and audience changes against real economic data. Compare control vs. experiment outcomes with full explainability.

---

## What It Does

TwinTrack lets a small business owner register their business as a **digital twin** — a structured snapshot of their financials, costs, and sales profile — and then run **what-if simulations** before making real decisions.

Each simulation runs a full pipeline:
1. Pulls live economic data (CPI, unemployment, GDP, consumer spending, local market density, news sentiment)
2. Computes price elasticity and market context using Claude Haiku
3. Models the financial outcome under the proposed change
4. Returns OP1 (control baseline) and OP2 (experiment result) with a plain-English recommendation

**Three use cases:**
- **Pricing changes** — raise or lower average price; models demand response via price elasticity derived from CPI trends
- **Target audience** — shift to a new demographic segment; models ticket size, footfall, and marketing cost impact
- **Franchise expansion** — open new locations; models upfront costs, amortized over 36 months, with break-even projection

---

## Architecture

```
twintrack/          ← React + Vite frontend (port 5173)
backend/
  server.py         ← ThreadingHTTPServer (port 8765)
  ml/               ← Market data + LLM layer
    fetcher.py      ← FRED, BLS, BEA, Census, NewsAPI
    context.py      ← NAICS/MSA resolver via Claude Haiku
    elasticity.py   ← Price/labor/market elasticity
    forecaster.py   ← ARIMA 12-month projections
    sentiment.py    ← News sentiment scoring
    ms_builder.py   ← Builds MS (market snapshot) JSON
    main.py         ← ML pipeline entry point
  sim/
    sim_bridge.py   ← Translates frontend form → IP1/IP2
    sim_layer.py    ← Financial simulation engine
  data/
    base/           ← Enrollment JSON + IP files
    ms/             ← Market snapshot outputs
    op/             ← Simulation outputs (OP1 + OP2)
    cache/          ← API response cache (by date)
```

**Request flow for a simulation:**
```
Frontend → POST /api/simulate
  → load twin layer from disk
  → write IP file
  → ml_run()        → ms/ms_exp_<bizid>_<date>.json
  → run_simulation() → {op1, op2}
  → write_op()      → op/op_<usecase>_<bizid>_<date>.json
  → return {op1, op2, recommendation}
```

---

## Setup

### Prerequisites
- Python 3.10+
- Node.js 18+

### 1. Clone and install

```bash
# Python dependencies (from repo root)
pip install -r requirements.txt

# Frontend dependencies
cd twintrack
npm install
```

### 2. Environment variables

Copy `.env.example` to `.env` and fill in your keys:

```env
ANTHROPIC_API_KEY=sk-ant-...

FRED_API_KEY=...
BLS_API_KEY=...
BEA_API_KEY=...
CENSUS_API_KEY=...
NEWSDATA_API_KEY=...
```

| Key | Get it from |
|-----|-------------|
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) |
| `FRED_API_KEY` | [fred.stlouisfed.org/docs/api](https://fred.stlouisfed.org/docs/api/api_key.html) |
| `BLS_API_KEY` | [data.bls.gov/registrationEngine](https://data.bls.gov/registrationEngine/) |
| `BEA_API_KEY` | [apps.bea.gov/API/signup](https://apps.bea.gov/API/signup/) |
| `CENSUS_API_KEY` | [api.census.gov/data/key_signup.html](https://api.census.gov/data/key_signup.html) |
| `NEWSDATA_API_KEY` | [newsdata.io](https://newsdata.io) |

### 3. Run

**Terminal 1 — backend:**
```bash
python backend/server.py
# Listening on http://127.0.0.1:8765
```

**Terminal 2 — frontend:**
```bash
cd twintrack
npm run dev
# Running on http://localhost:5173
```

Open **http://localhost:5173** in your browser.

---

## Usage

### Step 1 — Register your business
Go to **Register business** in the sidebar. Enter your financials, cost breakdown, loan details, sales channel, and product info. The server assigns a `business_id` (integer, starting at 1) and writes:
- `backend/data/base/input_newbusiness_<date>.json`
- `backend/data/base/ip_<bizid>_<date>.json`

### Step 2 — Run a simulation
Go to **Run simulation**. Select your registered business, pick a use case, fill in the parameters, and optionally describe your decision in plain English. The LLM layer will extract and merge any additional parameters from your description.

Click **Run simulation engine** to execute the full pipeline. Results appear as OP1 (control) and OP2 (experiment) with a Claude-generated recommendation.

### Step 3 — View results
The dashboard shows:
- Revenue, margin, and footfall delta (OP2 vs OP1)
- 12-month projections (ARIMA)
- Confidence score
- News sentiment (from local market news)
- Plain-English verdict: **proceed / proceed with caution / avoid**

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Server health check |
| `POST` | `/api/save-twin-layer` | Register/update a business |
| `POST` | `/api/simulate` | Run a simulation |
| `GET` | `/api/list-businesses` | List all enrolled businesses |
| `GET` | `/api/op-result?business_id=1&use_case=pricing` | Fetch latest OP output |
| `POST` | `/api/update-twin-layer` | Update business financials |

---

## Data Sources

| Source | What it provides |
|--------|-----------------|
| **FRED** (St. Louis Fed) | CPI, interest rates, GDP |
| **BLS** (Bureau of Labor Statistics) | Unemployment by metro area |
| **BEA** (Bureau of Economic Analysis) | Consumer spending by sector |
| **Census** | Business density by NAICS + metro |
| **NewsData.io** | Local news sentiment for the business category |

All API responses are cached to `backend/data/cache/` by date. Repeat runs on the same day reuse the cache.

---

## LLM Integration

Three Claude Haiku (`claude-haiku-4-5-20251001`) calls in the pipeline:

1. **NAICS + MSA resolver** — maps `business_type + city + state` → `naics_code + msa_code` when the business type doesn't match the dropdown options
2. **NL → IP2 enrichment** — extracts structured simulation parameters from the optional plain-English description on step 3; only overrides keys explicitly mentioned
3. **Recommendation generator** — writes a 2–3 sentence verdict grounded in the actual OP delta numbers (revenue, margin, footfall, confidence score)

All three calls degrade gracefully — if the API key is missing or the call fails, the pipeline continues without LLM output.

---

## File Naming Convention

| Layer | Pattern |
|-------|---------|
| Enrollment | `input_newbusiness_<date>.json` |
| IP (twin layer) | `ip_<bizid>_<date>.json` |
| Market snapshot | `ms_exp_<bizid>_<date>.json` |
| Simulation output | `op_<usecase>_<bizid>_<date>.json` |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite 5 |
| Backend | Python 3 `http.server.ThreadingHTTPServer` |
| Forecasting | `statsmodels` ARIMA, `pmdarima` auto-ARIMA |
| LLM | Anthropic Claude Haiku (`anthropic` SDK) |
| Data | `pandas`, `requests` |
| Config | `python-dotenv` |

---

## Project Structure Notes

- `backend/server.py` — single-file HTTP server; all routes in one `do_GET` / `do_POST` handler
- `backend/ml/` — stateless pipeline; each module exports one main function
- `backend/sim/sim_bridge.py` — translates messy frontend form values into clean IP1/IP2 dicts, with sanity checks and warnings
- `twintrack/src/TwinTrack.jsx` — main app component; all pages rendered inline (no router)
- `twintrack/src/Dashboard.jsx` — live dashboard that fetches OP output from the backend

---

*Built at WEHack UTD · April 2026*
