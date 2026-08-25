#!/usr/bin/env python3
"""
Regenerates kernel/fixtures/sequence-matcher-golden.json from the REAL parent.

    python3 kernel/fixtures/generate_sequence_matcher_golden.py \
        > kernel/fixtures/sequence-matcher-golden.json

The parent here is CPython's own `difflib.SequenceMatcher`, which
`kernel/sequence-matcher.ts` is a port of. That makes this golden unusual and
valuable: **the parent ships in the standard library, so CI can re-run it** and
diff against the committed file. For this port gate 11 is genuinely
load-bearing — it can fail on real divergence, not just on a stored number.

The INPUTS below are the ones the committed golden was built from, reproduced
verbatim. They are not re-chosen here: re-picking the cases while regenerating
would quietly swap the coverage (autojunk, unicode) for whatever the author of
the day thought of, and the file would still look freshly generated.

`autojunk-trigger` is the one that earns its place. difflib purges any element
occupying >1% of a sequence of length >= 200 from the matching set, and no
Scrapling fixture is long enough to reach that branch — a port that skips
autojunk passes everything else and fails only here.
"""
import difflib
import json

CASES = [
    ('identical-strings', 'hello world', 'hello world'),
    ('completely-different', 'abcdef', 'ghijkl'),
    ('empty-both', '', ''),
    ('empty-one-side', 'abc', ''),
    ('partial-overlap', 'The quick brown fox', 'The slow brown fox'),
    ('single-char', 'a', 'a'),
    ('unicode-emoji', 'café 🎉 test', 'cafe 🎉 test'),
    ('autojunk-trigger', 'pzqzrzs', 'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz'),
    ('autojunk-not-triggered-under-200', 'pzqzrzs', 'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz'),
]

out = [
    {"name": name, "a": a, "b": b, "expected": difflib.SequenceMatcher(None, a, b).ratio()}
    for name, a, b in CASES
]
print(json.dumps(out, indent=2))
