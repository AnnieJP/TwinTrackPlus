"""
Data Agent — resolves business classification codes and analyzes news sentiment.

Tools available to this agent:
  - lookup_naics_code: checks hardcoded NAICS table
  - lookup_msa_code:   checks hardcoded MSA table

If either lookup returns "not found", the agent uses its own knowledge of US
industry classification to fill the gap rather than calling a cloud API.
"""
import json
import sys
import os

# Make backend/ importable so "from agents.base import ..." works from any caller
_BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _BACKEND not in sys.path:
    sys.path.insert(0, _BACKEND)

from agents.base import run_agent

# ---------------------------------------------------------------------------
# NAICS + MSA lookup tables (mirrors context.py — single source of truth
# is kept here; context.py delegates to this agent for unknown types)
# ---------------------------------------------------------------------------
NAICS_LOOKUP = {
    "bakery": "311811", "bread shop": "311811", "pastry shop": "311811",
    "restaurant": "722511", "fast food": "722513", "coffee shop": "722515",
    "cafe": "722515", "bar": "722410", "clothing store": "448140",
    "apparel store": "448140", "shoe store": "448210", "salon": "812112",
    "hair salon": "812112", "barbershop": "812111", "nail salon": "812113",
    "gym": "713940", "fitness center": "713940", "yoga studio": "713940",
    "florist": "453110", "flower shop": "453110", "grocery": "445110",
    "grocery store": "445110", "convenience store": "445131",
    "gift shop": "453220", "jewelry store": "448310", "bookstore": "451211",
    "pet store": "453910", "pharmacy": "446110", "hardware store": "444110",
    "furniture store": "442110",
}

MSA_LOOKUP = {
    "new york": "35620", "los angeles": "31080", "chicago": "16980",
    "houston": "26420", "dallas": "19100", "plano": "19100", "austin": "12420",
    "seattle": "42660", "miami": "33100", "atlanta": "12060", "boston": "14460",
    "san francisco": "41860", "phoenix": "38060", "philadelphia": "37980",
    "san antonio": "41700", "san diego": "41740", "denver": "19740",
    "portland": "38900", "las vegas": "29820", "detroit": "19820",
    "minneapolis": "33460", "tampa": "45300", "orlando": "36740",
    "charlotte": "16740", "nashville": "34980", "raleigh": "39580",
    "richmond": "40060", "memphis": "32820", "louisville": "31140",
    "oklahoma city": "36420", "kansas city": "28140", "columbus": "18140",
    "indianapolis": "26900", "jacksonville": "27260", "salt lake city": "41620",
    "san jose": "41940", "sacramento": "40900", "pittsburgh": "38300",
    "cincinnati": "17140", "cleveland": "17460", "st louis": "41180",
    "baltimore": "12580", "washington": "47900", "new orleans": "35380",
    "buffalo": "15380", "hartford": "25540", "birmingham": "13820",
    "tucson": "46060", "fresno": "23420",
}

VALID_MSA = set(MSA_LOOKUP.values())

_FALLBACK_NAICS = "452319"  # General merchandise
_FALLBACK_MSA   = "19100"   # Dallas

# ---------------------------------------------------------------------------
# Tool definitions for the agent
# ---------------------------------------------------------------------------
_CODE_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "lookup_naics_code",
            "description": "Look up the 6-digit NAICS code for a business type in the classification table.",
            "parameters": {
                "type": "object",
                "properties": {
                    "business_type": {
                        "type": "string",
                        "description": "The type of business (e.g. 'coffee shop', 'gym', 'pharmacy')",
                    }
                },
                "required": ["business_type"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "lookup_msa_code",
            "description": "Look up the 5-digit MSA code for a US city in the classification table.",
            "parameters": {
                "type": "object",
                "properties": {
                    "city": {
                        "type": "string",
                        "description": "The city name in lowercase (e.g. 'dallas', 'seattle')",
                    }
                },
                "required": ["city"],
            },
        },
    },
]


def _lookup_naics_code(business_type: str) -> dict:
    code = NAICS_LOOKUP.get(business_type.lower().strip())
    return {"naics_code": code, "found": bool(code)}


def _lookup_msa_code(city: str) -> dict:
    code = MSA_LOOKUP.get(city.lower().strip())
    return {"msa_code": code, "found": bool(code)}


_CODE_TOOL_FUNCTIONS = {
    "lookup_naics_code": _lookup_naics_code,
    "lookup_msa_code": _lookup_msa_code,
}

_CODE_SYSTEM = """You are a US business classification specialist.
Your job: resolve a business type to a 6-digit NAICS code and a city to a 5-digit MSA code.

Process:
1. Call lookup_naics_code with the business type.
2. Call lookup_msa_code with the city.
3. For any "not found" result, use your knowledge of US NAICS and OMB MSA codes to provide the best match.
4. Respond ONLY with a JSON object — no explanation, no markdown:
   {"naics_code": "XXXXXX", "msa_code": "XXXXX"}"""


def resolve_business_codes(business_type: str, city: str, state: str) -> dict:
    """
    Data Agent entry point for NAICS/MSA resolution.
    Fast path: both codes in lookup table → return immediately.
    Slow path: unknown type/city → Ollama agent reasons and returns codes.
    """
    naics = NAICS_LOOKUP.get(business_type.lower().strip())
    msa   = MSA_LOOKUP.get(city.lower().strip())

    if naics and msa:
        return {"naics_code": naics, "msa_code": msa}

    print(f"[data_agent] Resolving codes via Ollama — business='{business_type}', city='{city}', state='{state}'")

    result = run_agent(
        system_prompt=_CODE_SYSTEM,
        user_message=(
            f'Business type: "{business_type}"\n'
            f'City: "{city}"\n'
            f'State: "{state}"\n\n'
            "Call the lookup tools, then return the JSON."
        ),
        tools=_CODE_TOOLS,
        tool_functions=_CODE_TOOL_FUNCTIONS,
    )

    try:
        raw = (result or "").strip()
        if "```" in raw:
            raw = raw.split("```")[1].lstrip("json").strip()
        parsed = json.loads(raw)

        resolved_naics = naics or parsed.get("naics_code", _FALLBACK_NAICS)
        resolved_msa   = msa   or parsed.get("msa_code",   _FALLBACK_MSA)
        # MSA must be in the valid set; fall back if not
        if resolved_msa not in VALID_MSA:
            resolved_msa = _FALLBACK_MSA

        return {"naics_code": resolved_naics, "msa_code": resolved_msa}

    except Exception as e:
        print(f"[data_agent] Code resolution parse failed ({e}) — using fallbacks")
        return {"naics_code": naics or _FALLBACK_NAICS, "msa_code": msa or _FALLBACK_MSA}


# ---------------------------------------------------------------------------
# Sentiment analysis (no tools needed — pure LLM text analysis)
# ---------------------------------------------------------------------------
_SENTIMENT_SYSTEM = """You are a business sentiment analyst.
Analyze news articles and determine their impact on a specific local business.
Return ONLY valid JSON — no explanation, no markdown."""


def analyze_sentiment(articles: list, context: dict) -> dict:
    """
    Data Agent entry point for news sentiment analysis.
    Uses Ollama to score articles and extract impact flags.
    """
    if not articles:
        return {"sentiment_score": 0.0, "flags": []}

    print(f"[data_agent] Analyzing {len(articles)} articles via Ollama...")

    headlines = "\n".join(
        f"- {a['title']}: {a.get('description', '')}"
        for a in articles[:15]
    )

    result = run_agent(
        system_prompt=_SENTIMENT_SYSTEM,
        user_message=(
            f"Business: {context['business_type']} in {context['city']}, {context['state']}.\n\n"
            f"Recent news articles:\n{headlines}\n\n"
            "Return ONLY this JSON:\n"
            '{\n'
            '  "sentiment_score": <float -1.0 to 1.0>,\n'
            '  "flags": [\n'
            '    {"headline": "...", "relevance": "...", "impact": "positive|negative|neutral"}\n'
            '  ]\n'
            '}\n'
            "Maximum 5 flags. ONLY include articles that are directly relevant to this specific "
            "business type and its local market. Skip any article about unrelated industries, "
            "companies, or distant regions that would not affect this business. "
            "If fewer than 2 articles are genuinely relevant, return an empty flags list."
        ),
    )

    try:
        raw = (result or "").strip()
        if "```" in raw:
            raw = raw.split("```")[1].lstrip("json").strip()
        parsed = json.loads(raw)
        print(f"[data_agent] Sentiment: {parsed.get('sentiment_score')}, flags: {len(parsed.get('flags', []))}")
        return parsed
    except Exception as e:
        print(f"[data_agent] Sentiment parse failed ({e}) — returning neutral")
        return {"sentiment_score": 0.0, "flags": []}
