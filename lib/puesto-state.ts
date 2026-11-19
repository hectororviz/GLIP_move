export type EstadoPuesto = "en-uso" | "disponible" | "incompleto" | "inconsistente";

export const ESTADO_META: Record<EstadoPuesto, { label: string; color: string }> = {
  "en-uso": { label: "Equipado en uso", color: "#15803d" },
  disponible: { label: "Equipado disponible", color: "#2563eb" },
  incompleto: { label: "Incompleto", color: "#b45309" },
  inconsistente: { label: "Inconsistente (usuario sin bienes)", color: "#dc2626" },
};

/**
 * Clasificación visual del puesto según relaciones reales en GLPI.
 * - items: bienes con locations_id = puesto.
 * - users: ocupantes del puesto (users_id en esos bienes y/o User.locations_id).
 * - hasPersonalAssets: el/los ocupantes tienen bienes asignados fuera del puesto
 *   (ej. notebooks personales con locations_id=0). En ese caso un puesto libre
 *   cuenta como "en-uso" (consistente) y no se mueve ningún bien.
 */
export function clasificarPuesto(items: number, users: number, hasPersonalAssets = false): EstadoPuesto {
  if (items > 0 && users > 0) return "en-uso";
  if (items > 0 && users === 0) return "disponible";
  if (items === 0 && users === 0) return "incompleto";
  if (items === 0 && users > 0 && hasPersonalAssets) return "en-uso";
  return "inconsistente";
}
