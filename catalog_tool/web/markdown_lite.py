"""A small, dependency-free Markdown → HTML renderer.

This intentionally supports only the subset of Markdown used by the in-app
user guide (headings, paragraphs, lists, tables, blockquotes/callouts, fenced
code, horizontal rules, and inline bold/italic/code/links). It is not a general
purpose Markdown engine — keeping it self-contained avoids adding a Python
dependency that would have to be pip-installed on every startup.
"""

from __future__ import annotations

import html
import re
from dataclasses import dataclass

_HEADING_RE = re.compile(r"^(#{1,6})\s+(.*)$")
_HR_RE = re.compile(r"^(-{3,}|\*{3,}|_{3,})$")
_UL_RE = re.compile(r"^(\s*)[-*+]\s+(.*)$")
_OL_RE = re.compile(r"^(\s*)\d+[.)]\s+(.*)$")
_TABLE_SEP_RE = re.compile(r"^\s*\|?[\s:|-]+\|?\s*$")

_TOKEN = "\x00{}\x00"


@dataclass
class TocEntry:
    level: int
    slug: str
    title: str


def _slugify(text: str) -> str:
    text = re.sub(r"<[^>]+>", "", text)
    text = text.strip().lower()
    text = re.sub(r"[^a-z0-9\s-]", "", text)
    text = re.sub(r"\s+", "-", text)
    return text.strip("-") or "section"


def _inline(text: str) -> str:
    """Render inline formatting after HTML-escaping the raw text."""
    text = html.escape(text, quote=False)
    protected: list[str] = []

    def protect(snippet: str) -> str:
        protected.append(snippet)
        return _TOKEN.format(len(protected) - 1)

    # Inline code spans (content is already escaped).
    text = re.sub(r"`([^`]+)`", lambda m: protect(f"<code>{m.group(1)}</code>"), text)

    # Links: [label](url)
    def link(m: re.Match[str]) -> str:
        label, url = m.group(1), m.group(2)
        safe_url = url.replace('"', "%22")
        return protect(
            f'<a href="{safe_url}" target="_blank" rel="noopener noreferrer">{label}</a>'
        )

    text = re.sub(r"\[([^\]]+)\]\(([^)\s]+)\)", link, text)

    # Bold then italic.
    text = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", text)
    text = re.sub(r"(?<!\*)\*([^*]+)\*(?!\*)", r"<em>\1</em>", text)

    text = re.sub(r"\x00(\d+)\x00", lambda m: protected[int(m.group(1))], text)
    return text


def _split_row(line: str) -> list[str]:
    line = line.strip()
    if line.startswith("|"):
        line = line[1:]
    if line.endswith("|"):
        line = line[:-1]
    return [cell.strip() for cell in line.split("|")]


def _render_list(lines: list[str]) -> str:
    """Render a (possibly nested) list block using an indentation stack."""
    root: list[str] = []
    # stack items: (indent, kind 'ul'/'ol', list_html_parts)
    stack: list[tuple[int, str, list[str]]] = []

    def close_to(indent: int) -> None:
        while stack and stack[-1][0] > indent:
            _, kind, parts = stack.pop()
            block = f"<{kind}>{''.join(parts)}</{kind}>"
            target = stack[-1][2] if stack else root
            if target and target[-1].endswith("</li>"):
                target[-1] = target[-1][: -len("</li>")] + block + "</li>"
            else:
                target.append(block)

    for line in lines:
        m_ul = _UL_RE.match(line)
        m_ol = _OL_RE.match(line)
        m = m_ul or m_ol
        if not m:
            continue
        indent = len(m.group(1))
        kind = "ul" if m_ul else "ol"
        content = _inline(m.group(2))
        close_to(indent)
        if not stack or stack[-1][0] < indent:
            stack.append((indent, kind, []))
        stack[-1][2].append(f"<li>{content}</li>")

    close_to(-1)
    if stack:
        _, kind, parts = stack[0]
        root.append(f"<{kind}>{''.join(parts)}</{kind}>")
    return "".join(root)


def render_markdown(md: str) -> tuple[str, list[TocEntry]]:
    """Convert *md* to an HTML fragment and a table of contents (h2/h3)."""
    lines = md.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    out: list[str] = []
    toc: list[TocEntry] = []
    seen_slugs: dict[str, int] = {}
    i, n = 0, len(lines)

    def unique_slug(text: str) -> str:
        base = _slugify(text)
        if base in seen_slugs:
            seen_slugs[base] += 1
            return f"{base}-{seen_slugs[base]}"
        seen_slugs[base] = 0
        return base

    while i < n:
        raw = lines[i]
        stripped = raw.strip()

        if stripped.startswith("```"):
            i += 1
            code: list[str] = []
            while i < n and not lines[i].strip().startswith("```"):
                code.append(lines[i])
                i += 1
            i += 1
            escaped = html.escape("\n".join(code), quote=False)
            out.append(f"<pre><code>{escaped}</code></pre>")
            continue

        if stripped == "":
            i += 1
            continue

        if _HR_RE.match(stripped):
            out.append("<hr>")
            i += 1
            continue

        m = _HEADING_RE.match(stripped)
        if m:
            level = len(m.group(1))
            title_html = _inline(m.group(2))
            slug = unique_slug(m.group(2))
            out.append(f'<h{level} id="{slug}">{title_html}</h{level}>')
            if level in (2, 3):
                # Store plain (unescaped) text — the template escapes it once.
                plain_title = html.unescape(re.sub(r"<[^>]+>", "", title_html))
                toc.append(TocEntry(level=level, slug=slug, title=plain_title))
            i += 1
            continue

        if (
            "|" in raw
            and i + 1 < n
            and _TABLE_SEP_RE.match(lines[i + 1])
            and "-" in lines[i + 1]
        ):
            header = _split_row(raw)
            i += 2
            rows: list[list[str]] = []
            while i < n and "|" in lines[i] and lines[i].strip():
                rows.append(_split_row(lines[i]))
                i += 1
            thead = "".join(f"<th>{_inline(c)}</th>" for c in header)
            tbody = "".join(
                "<tr>" + "".join(f"<td>{_inline(c)}</td>" for c in r) + "</tr>" for r in rows
            )
            out.append(
                f"<table><thead><tr>{thead}</tr></thead><tbody>{tbody}</tbody></table>"
            )
            continue

        if stripped.startswith(">"):
            quote: list[str] = []
            while i < n and lines[i].strip().startswith(">"):
                quote.append(re.sub(r"^\s*>\s?", "", lines[i]))
                i += 1
            inner, _ = render_markdown("\n".join(quote))
            out.append(f"<blockquote>{inner}</blockquote>")
            continue

        if _UL_RE.match(raw) or _OL_RE.match(raw):
            block: list[str] = []
            while i < n and (
                _UL_RE.match(lines[i])
                or _OL_RE.match(lines[i])
                or (lines[i].startswith((" ", "\t")) and lines[i].strip() and block)
            ):
                block.append(lines[i])
                i += 1
            out.append(_render_list(block))
            continue

        para: list[str] = [stripped]
        i += 1
        while i < n:
            nxt = lines[i]
            s = nxt.strip()
            if (
                s == ""
                or _HEADING_RE.match(s)
                or _HR_RE.match(s)
                or _UL_RE.match(nxt)
                or _OL_RE.match(nxt)
                or s.startswith(">")
                or s.startswith("```")
            ):
                break
            para.append(s)
            i += 1
        out.append(f"<p>{_inline(' '.join(para))}</p>")

    return "\n".join(out), toc
