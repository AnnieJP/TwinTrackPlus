"""
Shared Ollama client and agentic tool-use loop for TwinTrack agents.

All agents point to a local Ollama instance at http://localhost:11434/v1
using the OpenAI-compatible API — no cloud costs, no API keys.
"""
import json
import time
from openai import OpenAI
from openai import APIConnectionError, APITimeoutError

OLLAMA_BASE_URL = "http://localhost:11434/v1"
MODEL           = "qwen2.5:7b"
REQUEST_TIMEOUT = 45.0   # seconds per Ollama call before giving up
MAX_RETRIES     = 2      # retry attempts after first failure (3 total)
RETRY_DELAY     = 2.0    # seconds between retries

_client = None


def get_client() -> OpenAI:
    global _client
    if _client is None:
        _client = OpenAI(
            base_url=OLLAMA_BASE_URL,
            api_key="ollama",
            timeout=REQUEST_TIMEOUT,
        )
    return _client


def _call_with_retry(client: OpenAI, kwargs: dict, max_retries: int = MAX_RETRIES):
    """
    Call client.chat.completions.create with automatic retry on transient errors.

    Retries on: APIConnectionError, APITimeoutError (Ollama cold-start, timeout).
    Raises immediately on any other exception (bad prompt, model error, etc.).
    """
    last_exc = None
    for attempt in range(max_retries + 1):
        try:
            return client.chat.completions.create(**kwargs)
        except (APIConnectionError, APITimeoutError) as e:
            last_exc = e
            if attempt < max_retries:
                print(f"[base] Ollama call failed ({type(e).__name__}: {e}) "
                      f"— retry {attempt + 1}/{max_retries} in {RETRY_DELAY}s")
                time.sleep(RETRY_DELAY)
            else:
                print(f"[base] All {max_retries + 1} attempts failed — giving up")
    raise last_exc


def run_agent(
    system_prompt: str,
    user_message: str,
    tools: list = None,
    tool_functions: dict = None,
    max_iterations: int = 5,
    max_retries: int = MAX_RETRIES,
) -> str:
    """
    Core agentic loop: the LLM reasons, calls tools, reasons again until done.

    Args:
        system_prompt:   role/instructions for the agent
        user_message:    the task to perform
        tools:           list of OpenAI-format tool definitions (optional)
        tool_functions:  dict mapping tool name → callable (optional)
        max_iterations:  max tool-call rounds before giving up

    Returns:
        Final text response from the agent.
    """
    client = get_client()
    messages = [{"role": "user", "content": user_message}]
    tool_functions = tool_functions or {}

    for _ in range(max_iterations):
        kwargs = {
            "model": MODEL,
            "messages": [{"role": "system", "content": system_prompt}] + messages,
        }
        if tools:
            kwargs["tools"] = tools
            kwargs["tool_choice"] = "auto"

        response = _call_with_retry(client, kwargs, max_retries=max_retries)
        choice = response.choices[0]

        # Build assistant message for history
        msg = {"role": "assistant", "content": choice.message.content or ""}
        if choice.message.tool_calls:
            msg["tool_calls"] = [
                {
                    "id": tc.id,
                    "type": "function",
                    "function": {
                        "name": tc.function.name,
                        "arguments": tc.function.arguments,
                    },
                }
                for tc in choice.message.tool_calls
            ]
        messages.append(msg)

        # No tool calls → agent produced its final answer
        if not choice.message.tool_calls:
            return choice.message.content or ""

        # Execute each tool call and feed results back into the conversation
        for tc in choice.message.tool_calls:
            try:
                args = json.loads(tc.function.arguments)
                fn = tool_functions.get(tc.function.name)
                result = fn(**args) if fn else {"error": f"Tool '{tc.function.name}' not found"}
            except Exception as e:
                result = {"error": str(e)}

            messages.append({
                "role": "tool",
                "tool_call_id": tc.id,
                "content": json.dumps(result),
            })

    # Max iterations reached — return last assistant content
    for m in reversed(messages):
        if m["role"] == "assistant" and m.get("content"):
            return m["content"]
    return ""
