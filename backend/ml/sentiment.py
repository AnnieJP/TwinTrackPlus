import os
import json
from anthropic import Anthropic
from dotenv import load_dotenv

load_dotenv()

client = Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))


def _build_prompt(articles: list, context: dict) -> str:
    """Build business-context aware sentiment prompt."""
    headlines = "\n".join(
        f"- {a['title']}: {a.get('description', '')}"
        for a in articles[:15]  # Cap at 15 articles
    )

    return f"""You are analyzing news sentiment for a {context['business_type']} located in {context['city']}, {context['state']}.

Here are recent news articles:
{headlines}

Analyze how these articles would impact this specific business.

Return ONLY a valid JSON object with no explanation:
{{
  "sentiment_score": <float between -1.0 (very negative) and 1.0 (very positive)>,
  "flags": [
    {{
      "headline": "<brief flag title>",
      "relevance": "<why this matters to this business>",
      "impact": "<positive|negative|neutral>"
    }}
  ]
}}

Rules:
- Only include flags genuinely relevant to this business type and location. Maximum 5 flags.
- You MUST include at least one flag of each impact type (positive, negative, neutral) if the articles support it.
- Use "neutral" for articles that are contextually relevant but have ambiguous or mixed effects on this business."""


def run_sentiment(raw_data: dict, context: dict) -> dict:
    """
    Run sentiment analysis on fetched news articles.

    Args:
        raw_data: output from fetcher.fetch_all()
        context:  business context from context.py

    Returns:
        {
            sentiment_score: float,
            flags: [{headline, relevance, impact}]
        }
    """
    articles = raw_data.get("news", {}).get("articles", [])

    if not articles:
        print("[sentiment] No articles found, returning neutral sentiment.")
        return {"sentiment_score": 0.0, "flags": []}

    print(f"[sentiment] Analyzing {len(articles)} articles via Claude Haiku...")

    prompt = _build_prompt(articles, context)

    try:
        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=1000,
            messages=[{"role": "user", "content": prompt}],
        )

        raw = response.content[0].text.strip()
        # Strip markdown code fences if present
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
            raw = raw.strip()

        if not raw:
            print("[sentiment] Claude Haiku returned empty response.")
            return {"sentiment_score": 0.0, "flags": []}

        result = json.loads(raw)
        print(f"[sentiment] Sentiment score: {result.get('sentiment_score')}, Flags: {len(result.get('flags', []))}")
        return result

    except json.JSONDecodeError as e:
        print(f"[sentiment] JSON parse failed: {e} — raw response was: {response.content[0].text[:200] if response else 'no response'}")
        return {"sentiment_score": 0.0, "flags": []}
    except Exception as e:
        print(f"[sentiment] Claude Haiku call failed: {e} — returning neutral sentiment.")
        return {"sentiment_score": 0.0, "flags": []}
