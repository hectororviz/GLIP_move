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
 * - users: usuarios distintos con users_id en esos bienes.
 * No infiere ocupantes desde bienes asignados a personas.
 */
export function clasificarPuesto(items: number, users: number): EstadoPuesto {
  if (items > 0 && users > 0) return "en-uso";
  if (items > 0 && users === 0) return "disponible";
  if (items === 0 && users === 0) return "incompleto";
  return "inconsistente";
}
