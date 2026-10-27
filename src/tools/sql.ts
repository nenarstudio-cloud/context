import { config } from "../config.ts";

// Table naming per mode. Zetaris addresses a registered table as <datasource>.<table> (or with the schema in between).
const z = (catalog: string, schema: string, n: string) => (config.zetarisTableStyle === "schema" ? `${catalog}.${schema}.${n}` : `${catalog}.${n}`);
export const T = {
  ops: (n: string) => (config.mode === "zetaris" ? z(config.catalogs.pg, "ops", n) : `ops.${n}`),
  docs: (n: string) => (config.mode === "zetaris" ? z(config.catalogs.s3, "docs", n) : `docs.${n}`),
  kobo: (n: string) => (config.mode === "zetaris" ? z(config.catalogs.kobo, "kobo", n) : `kobo.${n}`),
};

// Model-supplied values never reach SQL unvalidated.
export const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;
export function projectId(s: unknown): string {
  if (typeof s !== "string" || !/^pr\d{1,3}$/.test(s)) throw new Error(`invalid project_id: ${String(s)}`);
  return s;
}
export function kpiId(s: unknown): string {
  if (typeof s !== "string" || !/^K\d{1,3}$/.test(s)) throw new Error(`invalid kpi_id: ${String(s)}`);
  return s;
}
export function cleanTerm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 \-]/g, "").trim();
}
export function intIn(s: unknown, lo: number, hi: number, dflt: number): number {
  const n = typeof s === "number" ? Math.trunc(s) : dflt;
  return Math.min(hi, Math.max(lo, n));
}
export function dateStr(s: unknown): string | null {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}
