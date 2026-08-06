/**
 * Minimal line diff (LCS) used by the artifact version viewer.
 * Pure and dependency-free so it can run during render.
 */
export type DiffRow = { type: "same" | "add" | "del"; text: string; a?: number; b?: number };

export function diffLines(before: string, after: string): DiffRow[] {
  const a = before.split("\n");
  const b = after.split("\n");
  const n = a.length;
  const m = b.length;

  // Guard: LCS is O(n*m); fall back to a whole-file replace for huge files.
  if (n * m > 4_000_000) {
    return [
      ...a.map((text, i) => ({ type: "del" as const, text, a: i + 1 })),
      ...b.map((text, i) => ({ type: "add" as const, text, b: i + 1 })),
    ];
  }

  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const rows: DiffRow[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      rows.push({ type: "same", text: a[i], a: i + 1, b: j + 1 });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      rows.push({ type: "del", text: a[i], a: i + 1 });
      i++;
    } else {
      rows.push({ type: "add", text: b[j], b: j + 1 });
      j++;
    }
  }
  while (i < n) rows.push({ type: "del", text: a[i], a: ++i });
  while (j < m) rows.push({ type: "add", text: b[j], b: ++j });
  return rows;
}

export function diffStats(rows: DiffRow[]): { added: number; removed: number } {
  return {
    added: rows.filter((r) => r.type === "add").length,
    removed: rows.filter((r) => r.type === "del").length,
  };
}

/** Collapses long unchanged runs so the viewer shows only the changed hunks. */
export function collapseContext(rows: DiffRow[], context = 3): (DiffRow | { type: "gap" })[] {
  const keep = new Set<number>();
  rows.forEach((row, i) => {
    if (row.type === "same") return;
    for (let k = Math.max(0, i - context); k <= Math.min(rows.length - 1, i + context); k++)
      keep.add(k);
  });
  const out: (DiffRow | { type: "gap" })[] = [];
  let gap = false;
  rows.forEach((row, i) => {
    if (keep.has(i)) {
      out.push(row);
      gap = false;
    } else if (!gap) {
      out.push({ type: "gap" });
      gap = true;
    }
  });
  return out;
}
