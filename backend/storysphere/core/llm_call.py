"""The shared shape of an LLM call: retry policy, and the invoke itself.

Twenty-six ``@retry`` decorators were hand-copied across twelve services
before this module existed.  They were not, in fact, identical — eight
distinct configurations had drifted apart — but the parts that *should* be
uniform (how many attempts, what the backoff curve looks like) were being
re-decided by copy-paste at every site.  Those now live here; the exception
set stays at the call site, because which errors are worth retrying is a
real per-service judgement rather than boilerplate.

What this module deliberately leaves alone:

* **Tracing.** No ``@observe`` here, and none added by :func:`call_llm`.
  Span names and boundaries belong to whoever wrote the call site — see
  ``core/tracing.py`` for why.
* **Client construction.** Each service keeps its own lazily-built client;
  their temperatures differ (0.0 / 0.2 / 0.3) and the laziness is deliberate.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from storysphere.core.error_handling import llm_text
from storysphere.core.token_callback import set_llm_service_context

if TYPE_CHECKING:
    from collections.abc import Callable

# Three attempts is the number every call site had independently arrived at.
_ATTEMPTS = 3

# The default worth-retrying set: a malformed or unparseable model response.
# `LLMResponseBlocked` is pointedly **not** here and does not inherit from
# either of these — a provider that refuses a prompt on policy grounds will
# refuse it again, so retrying burned three calls per blocked item until
# B-073 made the exception a plain `Exception`. Anything added here must be
# transient; anything permanent must stay outside this tuple.
RETRYABLE = (ValueError, KeyError)


def llm_retry(
    exceptions: type[BaseException] | tuple[type[BaseException], ...] = RETRYABLE,
    *,
    min_wait: float = 1,
    max_wait: float = 5,
    reraise: bool = True,
):
    """Build the project's standard retry decorator.

    Args:
        exceptions: What to retry on.  Defaults to :data:`RETRYABLE`; pass a
            narrower or wider set when the service genuinely needs one.
        min_wait: First backoff, in seconds.
        max_wait: Backoff ceiling, in seconds.
        reraise: Let the final failure propagate rather than wrapping it in
            ``RetryError``.  True everywhere except two call sites that
            deliberately want the wrapped form.

    The returned decorator is safe to share: tenacity builds a fresh
    ``Retrying`` per decorated function, so two functions wearing the same
    decorator object do not share attempt counters.
    """
    return retry(
        retry=retry_if_exception_type(exceptions),
        stop=stop_after_attempt(_ATTEMPTS),
        wait=wait_exponential(multiplier=1, min=min_wait, max=max_wait),
        reraise=reraise,
    )


#: The common case, shared by the largest group of call sites.
LLM_RETRY = llm_retry()


async def call_llm(
    llm: Any,
    *,
    system: str,
    human: str,
    service: str,
    book_id: str | None,
    on_context_set: Callable[[], None] | None = None,
) -> str:
    """Send one system/human exchange to *llm* and return its text.

    Args:
        llm: A LangChain chat model, already built by the caller.
        system: The system prompt, already localised.  Localisation stays
            outside because not every service phrases the instruction the
            same way — see ``core.language_detection.localize_prompt`` for
            the common form.
        human: The user-turn content.
        service: Token-attribution bucket ("analysis", "extraction", …).
        book_id: The book these tokens belong to.  ``None`` means "whatever
            an entry point further up already set", which is how ingestion
            attributes a whole run from one place — it does not clear an
            existing value.  Use ``core.token_callback.set_llm_book_context``
            when you need to actually unset one.

            **This parameter has no default on purpose.** Token attribution
            used to depend on thirty-odd call sites each remembering to pass
            it, and roughly half of them did not; those still reported
            correctly only while some caller above them happened to set the
            value. Requiring the argument turns "someone forgot" into a
            signature error, and makes inheritance something a reader can
            see was chosen rather than omitted.
        on_context_set: Run after the attribution context is set and before
            the model is invoked.  A couple of call sites annotate the
            active tracing span there; they need the ordering, and this
            keeps the span work in their hands rather than this function's.

    Returns:
        The response text, via ``llm_text`` so that a provider-side block
        raises ``LLMResponseBlocked`` instead of yielding an empty string.
    """
    from langchain_core.messages import HumanMessage, SystemMessage  # noqa: PLC0415

    messages = [SystemMessage(content=system), HumanMessage(content=human)]
    set_llm_service_context(service, book_id=book_id)
    if on_context_set is not None:
        on_context_set()
    response = await llm.ainvoke(messages)
    return llm_text(response)
