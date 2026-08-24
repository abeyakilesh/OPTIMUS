/**
 * A faithful TypeScript port of CPython's `difflib.SequenceMatcher`
 * (isjunk=None, autojunk=True — the exact configuration Scrapling calls it
 * with: `SequenceMatcher(None, a, b)`).
 *
 * This is PORT, not "inspired by": the algorithm — Ratcliff/Obershelp longest
 * matching block, recursive on the remaining gaps, plus the autojunk
 * popular-element heuristic — is translated line-for-line from CPython's
 * Lib/difflib.py so that `.ratio()` returns bit-identical results to the
 * Python original on the same input. kernel/fixtures/scrapling-golden.json
 * proves this against the real upstream library, not a reimplementation of
 * its intent.
 *
 * A Python str is a sequence of Unicode code points; `Array.from(str)`
 * iterates the same way in JS (respecting surrogate pairs), so callers pass
 * `Array.from(text)` for character-level comparison and a plain string array
 * for element-level comparison (tag names, dict keys, …) — mirroring exactly
 * how Scrapling calls `SequenceMatcher(None, a, b)` with either a str or a
 * tuple.
 */

interface Match {
  a: number;
  b: number;
  size: number;
}

export class SequenceMatcher<T> {
  private a: readonly T[] = [];
  private b: readonly T[] = [];
  private b2j = new Map<T, number[]>();
  private bPopular = new Set<T>();
  private matchingBlocks: Match[] | undefined;

  constructor(a: readonly T[], b: readonly T[]) {
    this.setSeqs(a, b);
  }

  private setSeqs(a: readonly T[], b: readonly T[]): void {
    this.a = a;
    this.setSeq2(b);
  }

  private setSeq2(b: readonly T[]): void {
    this.b = b;
    this.matchingBlocks = undefined;
    this.chainB();
  }

  /** Builds b2j (element -> indices in b) and purges "popular" elements — CPython's autojunk. */
  private chainB(): void {
    const b = this.b;
    const b2j = new Map<T, number[]>();
    for (let i = 0; i < b.length; i++) {
      const elt = b[i];
      let indices = b2j.get(elt);
      if (!indices) {
        indices = [];
        b2j.set(elt, indices);
      }
      indices.push(i);
    }

    // autojunk: elements that make up more than 1% of a b with length >= 200
    // are "popular" and treated as junk — CPython does this to avoid
    // pathological slowdown on e.g. long runs of the same whitespace char.
    // None of Scrapling's inputs are typically this long, but omitting this
    // would silently diverge from the real algorithm on any that are.
    const popular = new Set<T>();
    const n = b.length;
    if (n >= 200) {
      const ntest = Math.floor(n / 100) + 1;
      for (const [elt, idxs] of b2j) {
        if (idxs.length > ntest) popular.add(elt);
      }
      for (const elt of popular) b2j.delete(elt);
    }

    this.b2j = b2j;
    this.bPopular = popular;
  }

  private findLongestMatch(alo: number, ahi: number, blo: number, bhi: number): Match {
    const { a, b, b2j } = this;
    let besti = alo;
    let bestj = blo;
    let bestsize = 0;

    let j2len = new Map<number, number>();
    for (let i = alo; i < ahi; i++) {
      const newj2len = new Map<number, number>();
      const indices = b2j.get(a[i]);
      if (indices) {
        for (const j of indices) {
          if (j < blo) continue;
          if (j >= bhi) break;
          const k = (j2len.get(j - 1) ?? 0) + 1;
          newj2len.set(j, k);
          if (k > bestsize) {
            besti = i - k + 1;
            bestj = j - k + 1;
            bestsize = k;
          }
        }
      }
      j2len = newj2len;
    }

    // isjunk is always None for Scrapling's calls, so there is no bjunk set
    // to extend matches through — only the plain equality extension applies.
    while (
      besti > alo &&
      bestj > blo &&
      a[besti - 1] === b[bestj - 1]
    ) {
      besti -= 1;
      bestj -= 1;
      bestsize += 1;
    }
    while (
      besti + bestsize < ahi &&
      bestj + bestsize < bhi &&
      a[besti + bestsize] === b[bestj + bestsize]
    ) {
      bestsize += 1;
    }

    return { a: besti, b: bestj, size: bestsize };
  }

  private getMatchingBlocks(): Match[] {
    if (this.matchingBlocks) return this.matchingBlocks;

    const la = this.a.length;
    const lb = this.b.length;
    const queue: [number, number, number, number][] = [[0, la, 0, lb]];
    const rawBlocks: Match[] = [];

    while (queue.length > 0) {
      const [alo, ahi, blo, bhi] = queue.pop()!;
      const match = this.findLongestMatch(alo, ahi, blo, bhi);
      if (match.size > 0) {
        rawBlocks.push(match);
        if (alo < match.a && blo < match.b) queue.push([alo, match.a, blo, match.b]);
        if (match.a + match.size < ahi && match.b + match.size < bhi) {
          queue.push([match.a + match.size, ahi, match.b + match.size, bhi]);
        }
      }
    }

    rawBlocks.sort((x, y) => x.a - y.a || x.b - y.b || x.size - y.size);

    // Collapse adjacent blocks into single runs, same as CPython.
    const nonAdjacent: Match[] = [];
    let i1 = 0;
    let j1 = 0;
    let k1 = 0;
    for (const { a: i2, b: j2, size: k2 } of rawBlocks) {
      if (i1 + k1 === i2 && j1 + k1 === j2) {
        k1 += k2;
      } else {
        if (k1) nonAdjacent.push({ a: i1, b: j1, size: k1 });
        i1 = i2;
        j1 = j2;
        k1 = k2;
      }
    }
    if (k1) nonAdjacent.push({ a: i1, b: j1, size: k1 });
    nonAdjacent.push({ a: la, b: lb, size: 0 });

    this.matchingBlocks = nonAdjacent;
    return nonAdjacent;
  }

  ratio(): number {
    const matches = this.getMatchingBlocks().reduce((sum, m) => sum + m.size, 0);
    const length = this.a.length + this.b.length;
    return length ? (2.0 * matches) / length : 1.0;
  }
}

/** `SequenceMatcher(None, a, b).ratio()` for two strings, compared by code point. */
export function stringRatio(a: string, b: string): number {
  return new SequenceMatcher(Array.from(a), Array.from(b)).ratio();
}

/** `SequenceMatcher(None, a, b).ratio()` for two element sequences (tuples). */
export function sequenceRatio<T>(a: readonly T[], b: readonly T[]): number {
  return new SequenceMatcher(a, b).ratio();
}
