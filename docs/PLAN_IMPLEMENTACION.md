# PLAN_IMPLEMENTACION — Fases, archivos, riesgos, validación

## Fase 1 — Sistema de diseño ✅
Archivos: `app/globals.css`, `tailwind.config.js`, `components/AppShell.tsx`, `components/ui.tsx` (nuevo), `lib/puesto-state.ts` (nuevo).
Riesgo: bajo. Validar: build, foco visible, reduced-motion, nav `aria-current`.

## Fase 2 — Estados + leyenda ✅
Archivos: `app/api/dashboard/route.ts` (`estados` locId→{items,users,estado} + `enUso/disponible/incompleto/inconsistente` por piso/global), `components/FloorMap.tsx` (`estadoOf`, `countsFloor`, `data-state`, leyenda).
Riesgo: truncado 1000/tipo (señalizado con “+”), caché 5m. No se infiere ocupante desde bien-directo. Validar: conteos = relaciones reales.

## Fase 3 — Interacciones plano ✅
Archivos: `components/FloorMap.tsx` (tooltip `tip-bubble`, `buscarEnPlano`, capas/filtros, `ZoomControls` + fit + `requestFullscreen`, `role=button` + teclado).
Riesgo: compatibilidad táctil (tap = click + focus), JPG intactos, coordenadas sin tocar. Validar: `?focus=` existente, pan/tap mobile, fullscreen preserva selección.

## Fase 4 — Panel lateral ✅
Archivos: `components/FloorMap.tsx` (header sticky + scroll, secciones, bienes compactos, labels “desvincular no elimina”).
Riesgo: nulo funcional (mismos PATCH). Validar: PATCHs, confirmaciones, scan.

## Fase 5 — Inicio ✅
Archivos: `app/page.tsx`, `components/ui.tsx` (`SegmentedBar`).
Riesgo: métricas ambiguas corregidas con aclaraciones. Validar: assigned≠occupied explicado, truncado visible.

## Fase 6 — Búsqueda + Config ✅
Archivos: `app/buscar/page.tsx` (tabla densa por defecto + orden + toggle, empty vs error), `app/config/page.tsx` (tabs `role=tab`, aviso tokens).
Riesgo: sin cambios de endpoints. Validar: ver-mapa, asignar, editar ubicación/usuario, scan cámara.

## Verificación global
- `npm run build` / `npm run lint` (si existen).
- Matriz §13: auth GLPI, bienes/usuarios, planos, puestos fijos, zoom/pan, selección, asignaciones visibles, edición, búsqueda, scan, calibración sin pérdida, estados = datos reales.
- No escrituras a GLPI prod en pruebas. No recalibración automática.
