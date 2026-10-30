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

// Código "A 0001-0045" -> GLPI lo guarda como "A-001-0045".
// Se generan variantes con guion, grupo medio normalizado y sin prefijo.
// La variante sin ceros solo se incluye si tiene 4+ dígitos (evita falsos positivos).
function letterSeriesVariants(t: string): string[] {
  const upper = t.replace(/\s+/g, " ").toUpperCase();
  const out = [t, upper];
  const m = upper.match(/^([A-Z])\s+(\d+)-(\d+)\s*$/);
  if (m) {
    const [, letter, g1, g2] = m;
    const g1norm = (g1.replace(/^0+/, "") || "0").padStart(3, "0");
    out.push(
      `${letter}-${g1}-${g2}`,
      `${letter}-${g1norm}-${g2}`,
      `${letter}-${g1.slice(-3)}-${g2}`,
      `${letter}${g1}${g2}`,
      `${g1}-${g2}`,
      `${g1}${g2}`
    );
    const stripped = `${g1}${g2}`.replace(/^0+/, "");
    if (stripped.length >= 4) out.push(stripped);
  } else {
    const noPrefix = upper.replace(/^[A-Z]\s+/, "");
    out.push(noPrefix);
    const digits = noPrefix.replace(/\D/g, "");
    if (digits) out.push(digits);
    const stripped = digits.replace(/^0+/, "");
    if (stripped.length >= 4) out.push(stripped);
  }
  return [...new Set(out)];
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

export function editFormOf(type: string): string {
  const map: Record<string, string> = {
    Computer: "computer.form.php",
    Monitor: "monitor.form.php",
    Phone: "phone.form.php",
    Printer: "printer.form.php",
    Peripheral: "peripheral.form.php",
    NetworkEquipment: "networkequipment.form.php",
  };
  return map[type] || `${type.toLowerCase()}.form.php`;
}

const FORM_TO_TYPE: Record<string, string> = {
  "computer.form.php": "Computer",
  "monitor.form.php": "Monitor",
  "phone.form.php": "Phone",
  "printer.form.php": "Printer",
  "peripheral.form.php": "Peripheral",
  "networkequipment.form.php": "NetworkEquipment",
};

// Parsea una URL de GLPI: http://host/front/<tipo>.form.php?id=123
// Devuelve {type, id} o null si no es una URL de GLPI válida.
export function parseGlpiUrl(raw: string): { type: string; id: number } | null {
  const t = (raw || "").trim();
  const m = t.match(/\/front\/([a-z]+\.form\.php)\?[^#]*\bid=(\d+)/i);
  if (!m) return null;
  const type = FORM_TO_TYPE[m[1].toLowerCase()];
  if (!type) return null;
  const id = Number(m[2]);
  if (!Number.isFinite(id) || id <= 0) return null;
  return { type, id };
}
