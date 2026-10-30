// Normalización de inventarios. Dos formatos:
// 1) Code128 10 dígitos zero-padded. Ej "0000012865" -> "12865".
// 2) Letra + serie. Ej "A 0001-0537" (GLPI lo guarda tal cual, con letra).
// GLPI puede guardar con o sin ceros, por eso se buscan varias variantes.
export function normalizeInventory(raw: string): string {
  const t = (raw || "").trim();
  const digits = t.replace(/\D/g, "");
  const src = digits || t;
  const stripped = src.replace(/^0+/, "") || "0";
  return stripped;
}

// "A 0001-0537" -> ["A 0001-0537", "0001-0537", "00010537", "10537", ...]
function letterSeriesVariants(t: string): string[] {
  const upper = t.replace(/\s+/g, " ").toUpperCase();
  const noPrefix = upper.replace(/^[A-Z]\s+/, "");
  const digits = noPrefix.replace(/\D/g, "");
  const stripped = digits.replace(/^0+/, "") || "0";
  return [t, upper, noPrefix, digits, stripped];
}

export function inventoryVariants(raw: string): string[] {
  const t = (raw || "").trim();
  if (/^[A-Za-z]\s*\d/.test(t)) {
    return [...new Set(letterSeriesVariants(t))];
  }
  const norm = normalizeInventory(t);
  const padded = norm.padStart(10, "0");
  return [...new Set([t, norm, padded])];
}

export function isValidScan(raw: string): boolean {
  const t = (raw || "").trim();
  return /^\d{10}$/.test(t) || /^[A-Za-z]\s*\d[\d\s-]*$/.test(t);
}
