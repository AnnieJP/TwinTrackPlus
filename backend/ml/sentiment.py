import os
import sys

# Make backend/ importable so agents package is accessible from ml/
_BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _BACKEND not in sys.path:
    sys.path.insert(0, _BACKEND)

from agents.data_agent import analyze_sentiment as _agent_analyze_sentiment


def run_sentiment(raw_data: dict, context: dict) -> dict:
    """
    Run sentiment analysis on fetched news articles via the Data Agent (Ollama).

    Args:
        raw_data: output from fetcher.fetch_all()
        context:  business context from context.py

    Returns:
        {sentiment_score: float, flags: [{headline, relevance, impact}]}
    """
    articles = raw_data.get("news", {}).get("articles", [])

    if not articles:
        print("[sentiment] No articles found, returning neutral sentiment.")
        return {"sentiment_score": 0.0, "flags": []}

    return _agent_analyze_sentiment(articles, context)
