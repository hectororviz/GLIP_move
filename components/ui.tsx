"use client";

export function Spinner({ label = "Cargando…" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-muted" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      {label}
    </span>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="empty-state card" role="status">
      <span className="font-semibold text-ink">{title}</span>
      {hint && <span className="text-sm">{hint}</span>}
    </div>
  );
}

export function SegmentedBar({ parts }: { parts: { value: number; color: string; label: string }[] }) {
  const total = Math.max(1, parts.reduce((a, b) => a + b.value, 0));
  return (
    <div className="segbar" role="img" aria-label={parts.map((p) => `${p.label}: ${p.value}`).join(" · ")}>
      {parts.map((p, i) => (
        <span key={i} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} />
      ))}
    </div>
  );
}

const TYPE_ICON: Record<string, string> = {
  Computer: "🖥️",
  Monitor: "🖵",
  Phone: "☎️",
  Printer: "🖨️",
  Peripheral: "⌨️",
  NetworkEquipment: "🌐",
};

export function TypeIcon({ type }: { type: string }) {
  return (
    <span aria-hidden="true" title={type}>
      {TYPE_ICON[type] || "📦"}
    </span>
  );
}
