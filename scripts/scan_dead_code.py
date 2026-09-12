#!/usr/bin/env python3
"""Find code nothing references — backend symbols, frontend exports, i18n keys, CSS classes.

B-091. Run it, read the list, then judge each entry. **The list is candidates,
not a delete queue.** Three outcomes have already come out of this scan and only
one of them is "remove it":

1. Dead — something replaced it. Delete.
2. A copy — the real thing exists and someone re-typed it as a literal
   (``CharacterAnalysisOutput`` was duplicated as a dict in analyze_character).
   Deleting freezes the duplication; the fix is to make the copy use the source.
3. Unwired — live consumers read what it would produce and get nothing
   (``ConceptInferencePipeline``; ``clearMurmur``, whose absence leaked). Deleting
   makes the gap permanent and invisible.

Usage:
    python scripts/scan_dead_code.py [backend|exports|i18n|css]

False positives are the whole difficulty. Each scanner below documents what it
excludes and what it still cannot see; read that before believing a number.

**Known gap (B-098)**: only the backend scan strips comments and string literals
before counting references (see ``_code_only``). The three frontend scans still
count prose, so a TS export named only in a comment reads as referenced. Doing it
exactly there needs a real parser — a regex stripper trips over regex literals,
nested template literals and quotes inside comments, and inventing false
positives is the failure mode this file exists to avoid.
"""

from __future__ import annotations

import ast
import collections
import io
import json
import pathlib
import re
import sys
import tokenize

ROOT = pathlib.Path(__file__).resolve().parent.parent
BACKEND = ROOT / "backend" / "storysphere"
FRONTEND = ROOT / "frontend" / "src"


# COMMENT and STRING carry prose, not references. FSTRING_MIDDLE is the same
# text in 3.12+, where f-strings stopped arriving as a single STRING token;
# the expressions inside an f-string still tokenize as ordinary NAMEs and stay.
_PROSE_TOKENS = {tokenize.COMMENT, tokenize.STRING} | (
    {tokenize.FSTRING_MIDDLE} if hasattr(tokenize, "FSTRING_MIDDLE") else set()
)


def _code_only(src: str) -> str:
    """Drop comments and string literals, keeping only executable tokens.

    Counting references over the raw file text makes a symbol look alive when
    its only other mention is prose in its own docstring. That is a false
    *negative*, and it is worse than the false positives documented elsewhere in
    this file: an over-eager scanner shows you a name you can dismiss, while this
    one shows you nothing at all.

    Two symbols were hidden this way — ``_REFINEMENT_CONFIDENCE_THRESHOLD``,
    named once in the docstring of the function that stopped using it, and
    ``ConceptInferencePipeline`` (B-092), which this scanner should have been
    able to find on its own instead of waiting to be found by hand.

    An unparseable file keeps its raw text: counting a few prose mentions is the
    safe direction to fail, since it can only hide a candidate, never invent one.
    """
    out: list[str] = []
    try:
        for tok in tokenize.generate_tokens(io.StringIO(src).readline):
            if tok.type not in _PROSE_TOKENS:
                out.append(tok.string)
    except (tokenize.TokenError, IndentationError, SyntaxError):
        return src
    return " ".join(out)


def _frontend_code() -> str:
    return "\n".join(
        p.read_text(errors="ignore")
        for p in FRONTEND.rglob("*.ts*")
        if p.name != "generated.ts"
    )


def _dynamic_prefixes(code: str) -> set[str]:
    """Static prefixes of every interpolated template literal.

    Scanning ``t(`ns.x.${v}`)`` alone is not enough — the first version of this
    missed ``const key = `ns.x.${v}`; t(key)`` and reported three keys as unused
    that VoiceProfilingPanel builds at runtime. Taking the prefix from *any*
    template literal costs nothing and does not care how the value travels.

    The prefix is kept **without** requiring a trailing dot, because the
    interpolation can land mid-segment: ``nav.badge${cap(kind)}`` builds
    ``nav.badgeDev``. See the matching side in :func:`scan_i18n`.
    """
    out: set[str] = set()
    for m in re.finditer(r"`([^`]*?)\$\{", code):
        pre = m.group(1)
        if "." in pre:
            out.add(pre.rstrip("."))
    return out


# ── backend ──────────────────────────────────────────────────────────────────


#: Symbols that are genuinely called, just never by name from our code.
#: Each needs a reason — an entry without one is indistinguishable from a
#: symbol somebody could not be bothered to judge.
_NOT_DEAD = {
    "MetricsCollector.reset": "docstring says it exists for tests; no production caller is correct",
}


def _is_framework_callback(cls: ast.ClassDef, method: str) -> bool:
    """``on_*`` hooks on a LangChain callback handler are invoked by LangChain.

    They can never have a caller in this repo, so listing them as candidates
    only teaches the reader to skim the list — which is how a real entry gets
    missed.
    """
    bases = {ast.unparse(b).rsplit(".", 1)[-1] for b in cls.bases}
    return method.startswith("on_") and any(b.endswith("CallbackHandler") for b in bases)


def _direct_nested_defs(fn: ast.AST):
    """Nested defs whose *nearest* enclosing function is ``fn``.

    Not ``ast.walk``: that would report a doubly-nested helper once for every
    function above it, and the same symbol appearing twice in a candidate list
    is how a reader learns to stop trusting the list.
    """
    out = []

    def visit(node, top: bool) -> None:
        for child in ast.iter_child_nodes(node):
            if isinstance(child, ast.FunctionDef | ast.AsyncFunctionDef):
                if not top:
                    continue
                out.append(child)
                continue  # its own nested defs belong to it, not to fn
            visit(child, top)

    for stmt in fn.body:
        if isinstance(stmt, ast.FunctionDef | ast.AsyncFunctionDef):
            out.append(stmt)
        else:
            visit(stmt, True)
    return out


def _nested_unreferenced(tree: ast.Module, path: pathlib.Path):
    """Nested functions never named inside the function that defines them.

    A nested def is only reachable from its enclosing scope, so the enclosing
    function's own source is the whole search space — no cross-file counting,
    and no corpus split needed. B-091 listed this range as unscanned.
    """
    hits = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef):
            continue
        for nested in _direct_nested_defs(node):
            if nested.name.startswith("__"):
                continue
            # Same exclusion as the top-level scan: a decorator can register a
            # function with a framework, which then calls it without ever
            # naming it here. `@app.exception_handler` inside `create_app()`
            # is exactly that, and was this scan's only hit before the filter.
            deco = " ".join(ast.unparse(d) for d in nested.decorator_list)
            if re.search(r"\b(router|app)\.", deco):
                continue
            src = ast.unparse(node)
            # The `def <name>` line itself always contributes one occurrence.
            if len(re.findall(rf"\b{re.escape(nested.name)}\b", src)) <= 1:
                hits.append((path, nested.lineno, f"{node.name}() -> {nested.name}"))
    return hits


def scan_backend() -> int:
    files = [p for p in BACKEND.rglob("*.py") if "__pycache__" not in str(p)]
    prod = {p: _code_only(p.read_text(errors="ignore")) for p in files}
    # Tests and scripts are a SEPARATE corpus, not extra production files.
    # Counting them together is how "only the tests use it" hides: a symbol no
    # production path calls looks alive because its own test names it. B-091
    # listed that range as unscanned; splitting the corpora is what scans it.
    aux: dict[pathlib.Path, str] = {}
    for extra in ("tests", "scripts"):
        for p in (ROOT / extra).rglob("*.py"):
            aux[p] = _code_only(p.read_text(errors="ignore"))

    def _count(corpus: dict, name: str, own: pathlib.Path) -> int:
        return sum(
            len(re.findall(rf"\b{re.escape(name)}\b", text)) - (1 if p == own else 0)
            for p, text in corpus.items()
        )

    def refs(name: str, own: pathlib.Path) -> int:
        return _count(prod, name, own) + _count(aux, name, own)

    def test_only(name: str, own: pathlib.Path) -> bool:
        return _count(prod, name, own) == 0 and _count(aux, name, own) > 0

    test_only_hits: list[tuple[pathlib.Path, int, str]] = []

    hits = []
    for p in sorted(files):
        try:
            tree = ast.parse(p.read_text())
        except SyntaxError:
            continue
        for node in tree.body:
            if isinstance(node, ast.ClassDef):
                for m in node.body:
                    if not isinstance(m, ast.FunctionDef | ast.AsyncFunctionDef):
                        continue
                    # Private methods are included: `self._x()` counts as a
                    # reference like any other name, so a helper nobody calls
                    # shows up the same way a public one does. They were skipped
                    # until B-098; enabling them found nothing across the whole
                    # backend, which is the useful answer — that range was listed
                    # as unscanned in B-091 and is now scanned. Dunders stay out:
                    # they are called by the interpreter, never by name.
                    if m.name.startswith("__"):
                        continue
                    if _is_framework_callback(node, m.name):
                        continue
                    if f"{node.name}.{m.name}" in _NOT_DEAD:
                        continue
                    deco = " ".join(ast.unparse(d) for d in m.decorator_list)
                    # Route handlers and validators are called by name nowhere.
                    if any(
                        k in deco
                        for k in ("router.", "app.", "validator", "property", "abstract", "override")
                    ):
                        continue
                    if refs(m.name, p) == 0:
                        hits.append((p, m.lineno, f"{node.name}.{m.name}"))
                    elif test_only(m.name, p):
                        test_only_hits.append((p, m.lineno, f"{node.name}.{m.name}"))
            if isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef | ast.ClassDef):
                if node.name.startswith("__"):
                    continue
                deco = " ".join(ast.unparse(d) for d in node.decorator_list)
                if re.search(r"(router|app)\.(get|post|put|patch|delete|websocket)", deco):
                    continue
                if refs(node.name, p) == 0:
                    hits.append((p, node.lineno, node.name))
                elif test_only(node.name, p):
                    test_only_hits.append((p, node.lineno, node.name))
            for tgt in (
                [t.id for t in node.targets if isinstance(t, ast.Name)]
                if isinstance(node, ast.Assign)
                else [node.target.id]
                if isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name)
                else []
            ):
                if re.fullmatch(r"[A-Z][A-Z0-9_]{2,}", tgt) and refs(tgt, p) == 0:
                    hits.append((p, node.lineno, tgt))

    print(f"backend: {len(hits)} zero-reference symbols")
    for p, line, name in hits:
        print(f"  {p.relative_to(ROOT)}:{line}  {name}")

    # Reported separately because the judgement differs: a zero-reference symbol
    # might never have been wired, while one of these *is* exercised — just only
    # by the thing that exists to check it. That is the shape B-091 called the
    # most dangerous, because the test makes it look alive.
    print(f"\nbackend: {len(test_only_hits)} symbols referenced ONLY by tests/scripts")
    for p, line, name in test_only_hits:
        print(f"  {p.relative_to(ROOT)}:{line}  {name}")

    nested: list[tuple[pathlib.Path, int, str]] = []
    for p in sorted(files):
        try:
            nested += _nested_unreferenced(ast.parse(p.read_text()), p)
        except SyntaxError:
            continue
    print(f"\nbackend: {len(nested)} nested functions never named in their own scope")
    for p, line, name in nested:
        print(f"  {p.relative_to(ROOT)}:{line}  {name}")
    return len(hits)


# ── frontend exports ─────────────────────────────────────────────────────────


def scan_exports() -> int:
    files = [
        p
        for p in FRONTEND.rglob("*.ts*")
        if p.name != "generated.ts" and ".test." not in p.name
    ]
    text = {p: p.read_text(errors="ignore") for p in files}
    corpus = dict(text)
    for p in FRONTEND.rglob("*.test.ts*"):
        corpus[p] = p.read_text(errors="ignore")

    pat = re.compile(
        r"^export\s+(?:declare\s+)?(?:async\s+)?"
        r"(?:const|let|var|function|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)",
        re.M,
    )
    decls: dict[str, list[pathlib.Path]] = collections.defaultdict(list)
    for p, s in text.items():
        for m in pat.finditer(s):
            decls[m.group(1)].append(p)

    hits = [
        (owners[0], name)
        for name, owners in decls.items()
        if sum(
            len(re.findall(rf"\b{re.escape(name)}\b", s)) - (1 if p in owners else 0)
            for p, s in corpus.items()
        )
        <= 0
    ]
    print(f"frontend exports: {len(hits)} of {len(decls)} named exports unreferenced")
    for p, name in sorted(hits, key=lambda x: str(x[0])):
        print(f"  {p.relative_to(ROOT)}  {name}")
    return len(hits)


# ── i18n keys ────────────────────────────────────────────────────────────────


def scan_i18n() -> int:
    code = _frontend_code()
    dyn = _dynamic_prefixes(code)
    open_ended = len(re.findall(r"`\$\{", code))

    def leaves(d: dict, prefix: str = ""):
        for k, v in d.items():
            path = f"{prefix}.{k}" if prefix else k
            if isinstance(v, dict):
                yield from leaves(v, path)
            else:
                yield path

    total = guarded = 0
    rows: dict[str, list[str]] = collections.defaultdict(list)
    for f in sorted((FRONTEND / "i18n/locales/zh-TW").glob("*.json")):
        for path in leaves(json.loads(f.read_text())):
            total += 1
            # `p + "."` alone is not enough: the interpolation can land in the
            # *middle of a segment*, as in `nav.badge${cap(kind)}` — the prefix
            # is "nav.badge" and the key is "nav.badgeDev", which shares no dot
            # boundary with it. That gap deleted three live keys in the 2026-09-08
            # sweep and the settings page rendered bare `nav.badgeDev` until a
            # browser check caught it. Plain `startswith` covers both shapes; it
            # is looser, but the failure it prevents (a live key deleted) is worse
            # than the one it risks (a dead key kept).
            if any(path == p or path.startswith(p) for p in dyn):
                guarded += 1
                continue
            if re.search(rf"['\"`]{re.escape(path)}['\"`]", code):
                continue
            rows[f.stem].append(path)

    n = sum(len(v) for v in rows.values())
    print(f"i18n: {n} of {total} keys unreferenced ({guarded} shielded by a dynamic prefix)")
    print(
        f"  caveat: {open_ended} template literals start with an interpolation, so no "
        f"prefix can be taken from them — keys they build are not shielded"
    )
    for ns, keys in sorted(rows.items(), key=lambda kv: -len(kv[1])):
        print(f"  {ns}.json ({len(keys)})")
        for k in keys:
            print(f"      {k}")
    return n


# ── CSS classes ──────────────────────────────────────────────────────────────


def scan_css() -> int:
    code = _frontend_code()

    # `tl-pill-${type}` and 'tl-pill-' + type both mean every tl-pill-* is live.
    dyn: set[str] = set()
    for m in re.finditer(r"`([^`]*?)\$\{", code):
        tail = re.split(r"[\s\"'`]", m.group(1))[-1]
        if tail and re.fullmatch(r"[_a-zA-Z][\w-]*-", tail):
            dyn.add(tail)
    for m in re.finditer(r"['\"]([_a-zA-Z][\w-]*-)['\"]\s*\+", code):
        dyn.add(m.group(1))

    classes: dict[str, set[str]] = collections.defaultdict(set)
    for f in sorted(FRONTEND.rglob("*.css")):
        s = re.sub(r"/\*.*?\*/", "", f.read_text(), flags=re.S)
        for m in re.finditer(r"\.(-?[_a-zA-Z][\w-]*)", s):
            classes[f.name].add(m.group(1))

    rows: dict[str, list[str]] = collections.defaultdict(list)
    guarded = 0
    for f, names in classes.items():
        for n in sorted(names):
            if any(n.startswith(p) for p in dyn):
                guarded += 1
                continue
            if n in code:
                continue
            rows[f].append(n)

    total = sum(len(v) for v in classes.values())
    n = sum(len(v) for v in rows.values())
    print(f"css: {n} of {total} classes unreferenced ({guarded} shielded by a dynamic prefix)")
    for f, names in sorted(rows.items(), key=lambda kv: -len(kv[1])):
        if names:
            print(f"  {f} ({len(names)})")
            for c in names:
                print(f"      .{c}")
    return n


SCANNERS = {
    "backend": scan_backend,
    "exports": scan_exports,
    "i18n": scan_i18n,
    "css": scan_css,
}

if __name__ == "__main__":
    which = sys.argv[1:] or list(SCANNERS)
    unknown = [w for w in which if w not in SCANNERS]
    if unknown:
        sys.exit(f"unknown scanner(s): {unknown}; choose from {list(SCANNERS)}")
    for i, w in enumerate(which):
        if i:
            print()
        SCANNERS[w]()
