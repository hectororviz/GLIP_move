// Helpers de búsqueda genérica: normalización insensible a tildes/mayúsculas.
export function norm(s: any): string {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

export function contains(hay: any, q: string): boolean {
  const nq = norm(q);
  if (!nq) return false;
  return norm(hay).includes(nq);
}

export function matchesAny(fields: any[], q: string): boolean {
  const nq = norm(q);
  if (!nq) return false;
  return fields.some((f) => norm(f).includes(nq));
}
