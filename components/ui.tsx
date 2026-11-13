"use client";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { IconBox, IconDrive, IconGlobe, IconKeyboard, IconMonitor, IconPhone, IconPrinter } from "./icons";

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

const TYPE_ICON: Record<string, (p: { size?: number }) => React.ReactNode> = {
  Computer: (p) => <IconDrive {...p} />,
  Monitor: (p) => <IconMonitor {...p} />,
  Phone: (p) => <IconPhone {...p} />,
  Printer: (p) => <IconPrinter {...p} />,
  Peripheral: (p) => <IconKeyboard {...p} />,
  NetworkEquipment: (p) => <IconGlobe {...p} />,
};

export function TypeIcon({ type }: { type: string }) {
  const Cmp = TYPE_ICON[type] || ((p: { size?: number }) => <IconBox {...p} />);
  return (
    <span aria-hidden="true" title={type} className="inline-flex text-muted">
      <Cmp size={14} />
    </span>
  );
}

/* ---------- SidePanel: drawer derecho en desktop, fullscreen en móvil ---------- */
export function SidePanel({
  title,
  subtitle,
  onClose,
  children,
  footer,
  labelledBy,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  labelledBy?: string;
}) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const prevFocus = useRef<Element | null>(null);

  useEffect(() => {
    prevFocus.current = document.activeElement;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); }
    };
    document.addEventListener("keydown", onKey, true);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = prevOverflow;
      (prevFocus.current as HTMLElement | null)?.focus?.();
    };
  }, [onClose]);

  return (
    <>
      <div className="sidepanel-backdrop" onClick={onClose} aria-hidden="true" />
      <section
        className="sidepanel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy || titleId}
      >
        <header className="sidepanel-header px-4 pb-3 border-b border-line">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h2 id={labelledBy || titleId} className="font-bold text-ink text-[1.05rem] leading-tight clamp-2">
                {title}
              </h2>
              {subtitle && <div className="text-xs text-muted mt-0.5 truncate">{subtitle}</div>}
            </div>
            <button
              ref={closeRef}
              onClick={onClose}
              aria-label="Cerrar panel (Escape)"
              className="btn btn-secondary icon-btn shrink-0 tap-target"
            >
              <span aria-hidden="true" className="text-lg leading-none">✕</span>
            </button>
          </div>
        </header>
        <div className="sidepanel-body px-4 py-4">{children}</div>
        {footer && <footer className="sidepanel-footer px-4 pt-3">{footer}</footer>}
      </section>
    </>
  );
}

/* ---------- Tabs accesibles (nombres siempre visibles) ---------- */
export function Tabs({
  tabs,
  value,
  onChange,
  ariaLabel,
}: {
  tabs: { id: string; label: string; icon?: React.ReactNode; badge?: React.ReactNode }[];
  value: string;
  onChange: (id: string) => void;
  ariaLabel: string;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  function onKey(e: React.KeyboardEvent) {
    const i = tabs.findIndex((t) => t.id === value);
    let n: number | null = null;
    if (e.key === "ArrowRight") n = (i + 1) % tabs.length;
    if (e.key === "ArrowLeft") n = (i - 1 + tabs.length) % tabs.length;
    if (e.key === "Home") n = 0;
    if (e.key === "End") n = tabs.length - 1;
    if (n != null) {
      e.preventDefault();
      onChange(tabs[n].id);
      (listRef.current?.querySelectorAll('[role="tab"]')[n] as HTMLElement | undefined)?.focus();
    }
  }
  return (
    <div className="tabs rounded-t-xl overflow-hidden" role="tablist" aria-label={ariaLabel} onKeyDown={onKey} ref={listRef}>
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={value === t.id}
          tabIndex={value === t.id ? 0 : -1}
          onClick={() => onChange(t.id)}
          className="min-w-0"
        >
          {t.icon && <span aria-hidden="true" className="inline-flex shrink-0">{t.icon}</span>}
          <span className="truncate">{t.label}</span>
          {t.badge}
        </button>
      ))}
    </div>
  );
}

/* ---------- Searchable combobox ---------- */
export type ComboOption = { value: string; label: string; hint?: string };

export function SearchCombobox({
  id,
  label,
  placeholder,
  options,
  value,
  onSelect,
  disabled,
  loading,
  error,
  emptyText = "Sin coincidencias.",
  filterHint,
}: {
  id: string;
  label: string;
  placeholder: string;
  options: ComboOption[];
  value: string;
  onSelect: (v: string) => void;
  disabled?: boolean;
  loading?: boolean;
  error?: string;
  emptyText?: string;
  filterHint?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options.slice(0, 200);
    return options
      .filter((o) => o.label.toLowerCase().includes(q) || o.value === q.trim() || (o.hint || "").toLowerCase().includes(q))
      .slice(0, 200);
  }, [options, query]);

  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setOpen(false); inputRef.current?.blur(); }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open ]);

  useEffect(() => setActive(0), [query, options.length]);

  function choose(v: string) {
    onSelect(v);
    setOpen(false);
    setQuery("");
  }

  return (
    <div className="grid gap-1.5" ref={boxRef}>
      <label htmlFor={id} className="text-xs font-semibold text-ink">{label}</label>
      <div className="combo">
        <input
          ref={inputRef}
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && filtered[active] ? `${listId}-${active}` : undefined}
          className="input text-sm pr-9"
          placeholder={selected ? `${selected.label} — escribir para cambiar…` : placeholder}
          value={query}
          disabled={disabled}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, Math.max(0, filtered.length - 1))); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
            else if (e.key === "Enter") { if (open && filtered[active]) { e.preventDefault(); choose(filtered[active].value); } }
            else if (e.key === "Escape") { setOpen(false); }
          }}
        />
        <span aria-hidden="true" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted text-sm pointer-events-none">
          {loading ? <span className="spinner" /> : "▾"}
        </span>
        {open && !disabled && (
          <div id={listId} role="listbox" aria-label={label} className="combo-list">
            {loading && <p className="p-3 text-sm text-muted" role="status">Cargando opciones…</p>}
            {!loading && error && <p className="p-3 text-sm text-danger" role="alert">{error}</p>}
            {!loading && !error && filtered.length === 0 && <p className="p-3 text-sm text-muted" role="status">{emptyText}</p>}
            {!loading && !error && filtered.map((o, i) => (
              <button
                key={o.value}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={o.value === value}
                data-active={i === active}
                className="combo-opt"
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(o.value)}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-ink">{o.label}</span>
                  {o.hint && <span className="block truncate text-xs text-muted">{o.hint}</span>}
                </span>
                {o.value === value && <span aria-hidden="true" className="text-sm">✓</span>}
              </button>
            ))}
          </div>
        )}
      </div>
      {selected && (
        <p className="text-xs text-muted" role="status">
          Seleccionado: <b className="text-ink">{selected.label}</b>
          <button type="button" className="underline ml-2" onClick={() => onSelect("")} disabled={disabled}>Limpiar</button>
        </p>
      )}
      {filterHint && !selected && <p className="text-xs text-muted">{filterHint}</p>}
    </div>
  );
}

/* ---------- Confirmación accesible ---------- */
export function ConfirmDialog({
  title,
  body,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  danger,
  busy,
  onConfirm,
  onClose,
}: {
  title: string;
  body: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const okRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    okRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="confirm-backdrop" role="dialog" aria-modal="true" aria-label={title}>
      <div className="confirm-card card p-4 grid gap-3" role="document">
        <h2 className="font-bold text-ink">{title}</h2>
        <div className="text-sm text-muted grid gap-1">{body}</div>
        <div className="flex gap-2 justify-end flex-wrap">
          <button className="btn btn-secondary text-sm" onClick={onClose} disabled={busy}>{cancelLabel}</button>
          <button
            ref={okRef}
            className={`btn text-sm ${danger ? "btn-danger" : "btn-primary"}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? <span className="inline-flex items-center gap-2"><span className="spinner" aria-hidden="true" /> Procesando…</span> : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Botón con estado de carga ---------- */
export function BusyButton({
  busy,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean }) {
  return (
    <button {...props} disabled={busy || props.disabled} aria-busy={!!busy}>
      {busy ? <span className="inline-flex items-center gap-2"><span className="spinner" aria-hidden="true" /> Procesando…</span> : children}
    </button>
  );
}
