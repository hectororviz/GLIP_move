// Normalización Code128 10 dígitos zero-padded. Ej "0000012865" -> "12865".
// GLPI puede guardar con o sin ceros, por eso se buscan ambas variantes.
export function normalizeInventory(raw: string): string {
  const t = (raw || "").trim();
  const digits = t.replace(/\D/g, "");
  const src = digits || t;
  const stripped = src.replace(/^0+/, "") || "0";
  return stripped;
}

export function inventoryVariants(raw: string): string[] {
  const t = (raw || "").trim();
  const norm = normalizeInventory(t);
  const padded = norm.padStart(10, "0");
  return [...new Set([t, norm, padded])];
}

export function isValidScan(raw: string): boolean {
  return /^\d{10}$/.test((raw || "").trim());
}
