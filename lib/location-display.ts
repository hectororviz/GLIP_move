export type LocEntry = { id: number; name: string; completename: string; parentId: number | null };

export type LocationDisplay = { primary: string; secondary: string | null; full: string; isFloorOnly?: boolean };

export const PISO_RE = /(planta baja|piso|planta|nivel|\bpb\b)/i;
export const PUESTO_RE = /^puesto\b/i;

function norm(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export function isPisoName(name: string | null | undefined): boolean {
  if (!name) return false;
  return PISO_RE.test(norm(name).replace(/[\u0300-\u036f]/g, "")) || PISO_RE.test(String(name));
}

/** Orden de pisos: PB primero, luego por número inicial (1°, 2°, ...), resto alfabético. */
export function comparePisos(a: string, b: string): number {
  const na = norm(a);
  const nb = norm(b);
  const aIsPB = /(^|\s)pb(\s|$)/.test(na) || na.includes("planta baja");
  const bIsPB = /(^|\s)pb(\s|$)/.test(nb) || nb.includes("planta baja");
  if (aIsPB && !bIsPB) return -1;
  if (!aIsPB && bIsPB) return 1;
  const ma = na.match(/(\d+)/);
  const mb = nb.match(/(\d+)/);
  if (ma && mb && ma[1] !== mb[1]) return Number(ma[1]) - Number(mb[1]);
  if (ma && !mb) return -1;
  if (!ma && mb) return 1;
  return String(a).localeCompare(String(b));
}

function splitChain(full: string): string[] {
  return full
    .split(">")
    .map((s) => s.trim())
    .filter(Boolean);
}

function normalizePiso(s: string): string {
  const t = String(s || "").trim();
  // "PB" / "P.B." / "Planta Baja" -> "PB" (aún no relevado en algunos casos)
  if (/^(p\.?\s*b\.?|pb)$/i.test(t) || /planta\s*baja/i.test(t)) return "PB";
  // "3º Piso" / "3er piso" -> "3.º piso" (solo presentación)
  const m = t.match(/(\d+)\s*(º|ª|°|\.o|er|do)?\s*(piso|planta|nivel)/i);
  if (m) {
    const word = m[3].charAt(0).toUpperCase() + m[3].slice(1).toLowerCase();
    return `${m[1]}.º ${word.toLowerCase() === "piso" ? "piso" : word}`;
  }
  return t;
}

/**
 * Representación compacta para UI sin alterar datos GLPI.
 * Usa datos estructurados (byId + parentId); el string solo como fallback.
 */
export function formatLocationDisplay(
  locationId: number | null | undefined,
  byId: Map<number, LocEntry>,
  fallbackName?: string | null
): LocationDisplay {
  const none: LocationDisplay = { primary: "Sin ubicación", secondary: null, full: "Sin ubicación" };
  if (locationId == null) return none;
  const loc = byId.get(locationId);
  const full = loc?.completename || loc?.name || (fallbackName && String(fallbackName)) || `#${locationId}`;
  if (!loc && !fallbackName) return { primary: `#${locationId}`, secondary: null, full };

  // Cadena de ancestros vía parentId (estructurado).
  const chain: LocEntry[] = [];
  if (loc) {
    let cur: LocEntry | undefined = loc;
    const seen = new Set<number>();
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      chain.unshift(cur);
      cur = cur.parentId != null ? byId.get(cur.parentId) : undefined;
    }
  }
  const parts = chain.length ? chain.map((c) => c.name) : splitChain(full);
  const leaf = chain.length ? chain[chain.length - 1].name : parts[parts.length - 1] || full;

  // Puesto = nombre tipo "Puesto X" O hijo directo de un piso
  // (cubre puestos nombrados "23", "A-12", etc.).
  const parentOfLeaf = chain.length && chain.length > 1 ? chain[chain.length - 2] : undefined;
  const isPuesto = PUESTO_RE.test(leaf.trim()) || (parentOfLeaf ? isPisoName(parentOfLeaf.name) : false);
  const pisoEntry = chain.length
    ? [...chain].reverse().find((c, i) => i > 0 && isPisoName(c.name))
    : undefined;
  const pisoPart = pisoEntry?.name || parts.slice(0, -1).reverse().find((p) => isPisoName(p));

  // Ubicación directamente en el piso (sin puesto hijo): avisar explícito.
  if (!isPuesto && isPisoName(leaf)) {
    return { primary: normalizePiso(leaf), secondary: "(sin puesto específico)", full, isFloorOnly: true };
  }

  if (isPuesto && pisoPart) {
    const building = chain.length
      ? chain.find((c) => c.id !== pisoEntry?.id && c.id !== (loc?.id ?? -1) && !isPisoName(c.name) && !PUESTO_RE.test(c.name.trim()))?.name
      : parts.length > 2
        ? parts[parts.length - 3]
        : undefined;
    // Evitar repetir el polo completo: tomar el último segmento útil como edificio.
    const b = building && building !== parts[0] ? building : parts.length > 2 ? parts[parts.length - 3] : undefined;
    return { primary: `${normalizePiso(pisoPart)} · ${leaf.trim()}`, secondary: b || null, full };
  }
  if (isPuesto) return { primary: leaf.trim(), secondary: parts.length > 1 ? parts[parts.length - 2] : null, full };
  if (pisoEntry || (isPisoName(leaf) && !isPuesto)) {
    const pisoName = isPuesto ? leaf : pisoEntry?.name || leaf;
    const parentName = chain.length && chain.length > 1 ? chain[chain.length - 2].name : parts.length > 1 ? parts[parts.length - 2] : null;
    return { primary: normalizePiso(pisoName), secondary: parentName && parentName !== pisoName ? parentName : null, full };
  }
  // Sala/depósito u otra: nombre real, sin inventar piso/puesto.
  return { primary: leaf, secondary: parts.length > 1 ? parts[parts.length - 2] : null, full };
}
