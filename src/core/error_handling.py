from __future__ import annotations


def is_rate_limit_error(exc: Exception) -> bool:
    """Return True if exc is a rate-limit / quota-exhausted error from any LLM provider.

    Covers Gemini (ResourceExhausted), OpenAI (RateLimitError),
    Anthropic (RateLimitError / OverloadedError), and LangChain wrappers.
    """
    type_name = type(exc).__name__.lower()
    cause_name = type(exc.__cause__).__name__.lower() if exc.__cause__ else ""
    err_str = str(exc).lower()
    signals = ("ratelimit", "resourceexhausted", "quotaexceeded", "toomanyrequests", "overloaded")
    return (
        any(s in type_name for s in signals)
        or any(s in cause_name for s in signals)
        or "429" in err_str
        or "rate limit" in err_str
        or "quota" in err_str
        or "resource exhausted" in err_str
        or "overloaded" in err_str
    )
