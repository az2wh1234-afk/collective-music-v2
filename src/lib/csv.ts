const esc = (v: unknown): string => {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export function toCsv(rows: Record<string, unknown>[], columns?: string[]): string {
  const cols = columns ?? Array.from(rows.reduce((s, r) => { Object.keys(r).forEach(k => s.add(k)); return s; }, new Set<string>()));
  return [cols.join(','), ...rows.map(r => cols.map(c => esc(r[c])).join(','))].join('\n');
}
export function downloadText(filename: string, text: string, mime = 'text/csv;charset=utf-8') {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + text], { type: mime }));
  a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
export function flattenSurveys(rows: Record<string, unknown>[]): { rows: Record<string, unknown>[]; columns: string[] } {
  const base = ['created_at', 'session_id', 'run', 'pid', 'layer', 'skipped', 'met_other', 'reached_destination'];
  const keys = new Set<string>();
  const flat = rows.map(r => {
    const out: Record<string, unknown> = {}; base.forEach(k => { out[k] = r[k]; });
    const a = (r.answers ?? {}) as Record<string, unknown>;
    Object.keys(a).forEach(k => { keys.add(k); out[k] = Array.isArray(a[k]) ? (a[k] as unknown[]).join('; ') : a[k]; });
    return out;
  });
  return { rows: flat, columns: [...base, ...Array.from(keys).sort((x, y) => x.localeCompare(y, undefined, { numeric: true }))] };
}
