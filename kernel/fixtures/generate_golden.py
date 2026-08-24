#!/usr/bin/env python3
"""
Generates golden fixtures for the Scrapling similarity-scoring port
(kernel/scrapling.ts). Run from the Scrapling-main checkout:

    cd .../Scrapling-main
    python3 .../OPTIMUS/kernel/fixtures/generate_golden.py \
        > .../OPTIMUS/kernel/fixtures/scrapling-golden.json

Calls the REAL, unmodified upstream algorithm — `Selector.__calculate_similarity_score`
and `_StorageTools.element_to_dict` — via `object.__new__` to skip the heavy
constructor. Nothing here reimplements the scoring logic; that would defeat
the point of a fidelity fixture.
"""
import json
import sys

from lxml.html import fromstring
from scrapling.core.utils._utils import _StorageTools
from scrapling.parser import Selector

_scorer = object.__new__(Selector)
_score = _scorer._Selector__calculate_similarity_score  # noqa: SLF001 — deliberate, see module docstring


def fingerprint(html: str, xpath_index: int = 0):
    tree = fromstring(html)
    elements = tree.xpath("//*[not(self::html) and not(self::body) and not(self::head)]")
    el = elements[xpath_index]
    return el, _StorageTools.element_to_dict(el)


CASES = []


def case(name: str, original_html: str, candidate_html: str, original_index=0, candidate_index=0):
    _, original = fingerprint(original_html, original_index)
    candidate_el, _ = fingerprint(candidate_html, candidate_index)
    score = _score(original, candidate_el)
    CASES.append(
        {
            "name": name,
            "originalHtml": original_html,
            "candidateHtml": candidate_html,
            "originalIndex": original_index,
            "candidateIndex": candidate_index,
            "originalFingerprint": original,
            "expectedScore": score,
        }
    )


# 1 — identical element: must score exactly 100.
case(
    "identical",
    '<div class="price" id="p1">$899</div>',
    '<div class="price" id="p1">$899</div>',
)

# 2 — the whole point of Scrapling: a site redesign. Tag, class and structure
# all shift, but the SAME logical element must still score highly.
case(
    "site-redesign-price-tag",
    '<html><body><div id="product"><span class="old-price-tag" id="pr-9981">$899</span></div></body></html>',
    '<html><body><section id="product-v2"><p class="new-price-label" id="pr-9981">$899</p></section></body></html>',
)

# 3 — completely unrelated element: must score low.
case(
    "unrelated-element",
    '<div class="price">$899</div>',
    '<nav class="site-nav"><a href="/about">About</a></nav>',
)

# 4 — text changed (price updated) but everything structural is identical.
case(
    "text-changed-price-updated",
    '<span class="price" id="p1">$899</span>',
    '<span class="price" id="p1">$949</span>',
)

# 5 — nested with siblings and parent context, to exercise every branch of
# the scorer (parent_name, parent_attribs, parent_text, siblings).
case(
    "nested-with-siblings",
    (
        '<html><body><ul class="list"><li>Item A</li>'
        '<li class="target" data-id="42">Item B</li>'
        "<li>Item C</li></ul></body></html>"
    ),
    (
        '<html><body><ul class="list"><li>Item A</li>'
        '<li class="target" data-id="42">Item B updated</li>'
        "<li>Item C</li><li>Item D</li></ul></body></html>"
    ),
    # index 0 is <ul> itself (xpath excludes only html/body/head, not ul) —
    # the "target" <li> is index 2, not 1.
    original_index=2,
    candidate_index=2,
)

# 6 — element with no attributes at all, and no siblings.
case(
    "bare-element-no-attrs",
    "<p>Just some text</p>",
    "<p>Just some other text</p>",
)

print(json.dumps({"scraplingVersion": __import__("scrapling").__version__, "cases": CASES}, indent=2, sort_keys=True))
