export const BASE_PATH: string = process.env.NEXT_PUBLIC_BASE_PATH || '';
export function withBase(p: string): string {
  if (!p.startsWith('/')) return `${BASE_PATH}/${p}`;
  if (!BASE_PATH) return p;
  if (p === BASE_PATH || p.startsWith(`${BASE_PATH}/`)) return p;
  return `${BASE_PATH}${p}`;
}
