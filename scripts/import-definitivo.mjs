// Reemplazo TOTAL de mailGrants desde "Permisos_correos_institucionales_definitivo.xlsx".
//   node scripts/import-definitivo.mjs --dry-run   (solo reporte, no escribe)
//   node scripts/import-definitivo.mjs --apply      (backup + escribe + reporte JSON)
// Fuente de verdad: hoja "Permisos consolidados" (Correo|Usuario|Área|Acceso|Envío)
// + hoja "Casillas sin usuario" (mails que quedan existiendo sin grants).
// Acceso->canRead, Envío->canSend (flags exactos, sin preservar). Los mailGrants que no
// figuran en definitivo se ELIMINAN. shareGrants/áreas no se tocan (salvo crear mail nuevo).
import { createRequire } from "module";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

const __dir = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dir, "..");
const DATA = process.env.DATA_DIR || path.join(REPO, "data");
const API = process.env.API_BASE || "http://localhost:3000";
const XLSX_PATH = process.argv[2] && !process.argv[2].startsWith("--")
  ? process.argv[2]
  : "/home/horviz/Descargas/Permisos_correos_institucionales_definitivo.xlsx";
const APPLY = process.argv.includes("--apply");

const norm = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
const normMail = (s) => String(s || "").trim().toLowerCase();
const apellidoDe = (persona) => {
  const t = String(persona).trim().split(/\s+/).filter(Boolean);
  if (t.length <= 1) return String(persona).trim();
  return t.slice(0, -1).join(" ");
};

// Nombre completo primero (desambigua Sosa Paola/Veronica, typos), luego apellido.
const OVERRIDES_FULL = {
  "sosa paola": 86,          // Paola Elizabeth SOSA (programabec)
  "sosa veronica": 195,      // Veronica Analia SOSA (ictf, ita)
  "magenetto maia": 116,     // typo definitivo, es MAGNETTO Maia Elizabeth
  "magnetto maia": 116,
  "constanzo brenda": 192,   // typo z->s, es COSTANZO Brenda Ruth
  "costanzo brenda": 192,
  "jcompagnoni *": 151,
  "mabravetti": 220,
  "eran salamendi cesar": 186,
  "pera reanual enrique": 176,
  "albarracin frnazone martin": 133,
};
const OVERRIDES_SURNAME = {
  "dall armelina": 180,
  leone: 51,
  alvarez: 77,
  diaz: 122,
  leguizamon: 61,   // Valeria (no #87 Pablo)
  sala: 107,        // Mariana Eva SALA (no #186 SALAMENDI)
  ramos: 110,       // Maria Eugenia RAMOS (no #123 DELGADO RAMOS)
  rodriguez: 58,    // Valeria Silvia (apellido genérico)
  guardia: 88,      // Patricia Rosa GUARDIA
  celador: 91,      // Pablo Nicolas CELADOR
  zaldua: 130,      // Maricel Alexandra ZALDUA
  magenetto: 116,
  magnetto: 116,
  constanzo: 192,
  costanzo: 192,
  jcompagnoni: 151,
  mabravetti: 220,
};
const BECAS_CON_Y_AREA = "DGFEYL"; // definitivo la trae vacía; decidido con usuario

async function searchUsers(q) {
  const r = await fetch(`${API}/api/glpi/users?q=${encodeURIComponent(q)}`);
  const j = await r.json().catch(() => ({}));
  return r.ok ? j.users || [] : [];
}
async function getById(id) {
  const r = await fetch(`${API}/api/glpi/users?id=${id}`);
  const j = await r.json().catch(() => ({}));
  return r.ok && j.user ? j.user : null;
}

async function resolvePersona(persona) {
  const full = norm(persona);
  if (OVERRIDES_FULL[full] !== undefined) {
    const u = await getById(OVERRIDES_FULL[full]);
    return { user: u, strategy: u ? "override-full" : "override-missing", candidates: [] };
  }
  const surname = apellidoDe(persona);
  const key = norm(surname);
  if (OVERRIDES_SURNAME[key] !== undefined) {
    const u = await getById(OVERRIDES_SURNAME[key]);
    return { user: u, strategy: u ? "override-surname" : "override-missing", candidates: [] };
  }
  const queries = [surname];
  const tokens = surname.split(/\s+/).filter((t) => t.length >= 3);
  if (tokens.length > 1 && tokens[0] !== surname) queries.push(tokens[0]);
  if (surname.includes("'")) queries.push(surname.replace(/'/g, " "));
  if (surname.length >= 5) queries.push(surname.slice(0, 5));
  const seen = new Map();
  for (const qq of [...new Set(queries)]) {
    for (const u of await searchUsers(qq)) seen.set(u.id, u);
  }
  const cands = [...seen.values()].sort((a, b) => a.id - b.id);
  const exact = cands.filter((u) => norm(u.realname).includes(key));
  if (!exact.length) return { user: null, strategy: "no-exact-surname", candidates: cands };
  return { user: exact[exact.length - 1], strategy: exact.length > 1 ? "exact-highest-id" : "exact-unique", candidates: cands };
}

function loadDb() {
  return JSON.parse(fs.readFileSync(path.join(DATA, "access.json"), "utf8"));
}
const si = (v) => String(v ?? "").trim().toLowerCase().startsWith("s");

async function main() {
  const wb = XLSX.readFile(XLSX_PATH);
  const cons = XLSX.utils.sheet_to_json(wb.Sheets["Permisos consolidados"], { header: 1, defval: null });
  const cas = XLSX.utils.sheet_to_json(wb.Sheets["Casillas sin usuario"], { header: 1, defval: null });
  const header = cons[0].map((h) => String(h || ""));
  if (!/permiso acceso/i.test(header[3] || "") || !/permiso env/i.test(header[4] || "")) {
    throw new Error(`Formato inesperado en Permisos consolidados: ${JSON.stringify(header)}`);
  }
  const rows = cons.slice(1).filter((r) => r[0] && r[1]);
  const db = loadDb();
  const areaByName = new Map((db.areas || []).map((a) => [norm(a.nombre), a]));
  const mailByDir = new Map((db.mails || []).map((m) => [normMail(m.direccion), m]));

  // 1) resolver personas
  const personas = [...new Set(rows.map((r) => String(r[1]).trim()))].sort();
  const umap = {};
  for (const p of personas) umap[p] = await resolvePersona(p);

  // 2) mails: existentes + a crear (becas con-y) + casillas vacías
  const casMails = cas.slice(1).map((r) => normMail(r[0])).filter(Boolean);
  const wantMails = new Map(); // dir -> areaNombre
  for (const r of rows) {
    const dir = normMail(r[0]);
    const area = r[2] == null || String(r[2]).trim() === "" ? null : String(r[2]).trim();
    if (!wantMails.has(dir)) wantMails.set(dir, area);
  }
  // becas con-y viene sin área
  if (wantMails.has("becasymaestriasdgfeyl@agencia.gob.ar") && !wantMails.get("becasymaestriasdgfeyl@agencia.gob.ar")) {
    wantMails.set("becasymaestriasdgfeyl@agencia.gob.ar", BECAS_CON_Y_AREA);
  }
  for (const m of casMails) if (!wantMails.has(m)) wantMails.set(m, null);
  const mailsACrear = [...wantMails.keys()].filter((d) => !mailByDir.has(d));
  const areaMismatch = [];
  for (const [dir, area] of wantMails) {
    const ex = mailByDir.get(dir);
    if (ex && area) {
      const dbArea = (db.areas.find((a) => a.id === ex.areaId) || {}).nombre || ex.areaId;
      if (norm(dbArea) !== norm(area)) areaMismatch.push(`${dir}: definitivo=${area} vs DB=${dbArea} (se conserva DB)`);
    }
    if (ex && !area && !casMails.includes(dir)) areaMismatch.push(`${dir}: sin área en definitivo (se conserva DB)`);
  }
  const areasFaltantes = [...new Set([...wantMails.values()].filter(Boolean))].filter((a) => !areaByName.has(norm(a)));

  // 3) grants objetivo (flags exactos)
  const grantOps = [];
  const skipped = [];
  for (const r of rows) {
    const persona = String(r[1]).trim();
    const dir = normMail(r[0]);
    const res = umap[persona];
    if (!res || !res.user) { skipped.push({ fila: [r[0], persona, r[2]], motivo: `usuario sin match (${res ? res.strategy : "?"})` }); continue; }
    grantOps.push({ direccion: dir, userId: res.user.id, display: res.user.display, canRead: si(r[3]), canSend: si(r[4]) });
  }
  const keyOf = (accountId, userId) => `${accountId}|${userId}`;
  const mailIdFor = (dir) => {
    const ex = mailByDir.get(dir);
    if (ex) return ex.id;
    const base = norm(dir.split("@")[0]).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "mail";
    let id = base, n = 2;
    const taken = new Set([...mailByDir.values()].map((m) => m.id));
    while (taken.has(id)) id = `${base}-${n++}`;
    return id;
  };
  const objetivo = new Map(); // key -> {canRead,canSend,display}
  for (const g of grantOps) {
    const id = mailIdFor(g.direccion);
    g.accountId = id;
    objetivo.set(keyOf(id, g.userId), g);
  }
  const actual = new Map((db.mailGrants || []).map((g) => [keyOf(g.accountId, g.userId), g]));
  let crear = 0, actualizar = 0, eliminar = 0, iguales = 0;
  const detalleEliminar = [];
  for (const [k, g] of objetivo) {
    const ex = actual.get(k);
    if (!ex) crear++;
    else if (ex.canRead !== g.canRead || ex.canSend !== g.canSend) actualizar++;
    else iguales++;
  }
  for (const [k, g] of actual) {
    if (!objetivo.has(k)) {
      // conservar grants de casillas? No: casillas quedan vacías por definición (salvo que el grant sea de un mail fuera del alcance? todos los mails con grants están en definitivo o casillas)
      const m = (db.mails || []).find((x) => x.id === g.accountId);
      const dir = m ? m.direccion : g.accountId;
      if (casMails.includes(normMail(dir))) { eliminar++; if (detalleEliminar.length < 20) detalleEliminar.push(`${dir} | ${g.userDisplay} #${g.userId}`); }
      else { eliminar++; if (detalleEliminar.length < 20) detalleEliminar.push(`${dir} | ${g.userDisplay} #${g.userId}`); }
    }
  }

  console.log("=== DRY-RUN import-definitivo (REEMPLAZO TOTAL) ===");
  console.log(`Filas consolidados: ${rows.length} | Personas únicas: ${personas.length} | Casillas sin usuario: ${casMails.length}`);
  console.log(`Mails a crear (${mailsACrear.length}): ${mailsACrear.join(", ") || "—"}`);
  console.log(`Áreas faltantes (${areasFaltantes.length}): ${areasFaltantes.join(", ") || "—"}`);
  console.log(`Grants: crear=${crear} actualizar-flags=${actualizar} sin-cambios=${iguales} eliminar=${eliminar} | Saltadas: ${skipped.length}`);
  for (const s of skipped) console.log("  SKIP", JSON.stringify(s.fila), "-", s.motivo);
  for (const a of areaMismatch) console.log("  AREA", a);
  if (detalleEliminar.length) { console.log(`  ELIMINAR (muestra ${detalleEliminar.length}):`); for (const d of detalleEliminar) console.log("   - " + d); }
  const multi = Object.entries(umap).filter(([, v]) => v.user && v.candidates.length > 1);
  console.log(`Usuarios con >1 candidato (${multi.length}) — se usa mayor id salvo override:`);
  for (const [k, v] of multi) console.log(`  ${k} -> #${v.user.id} ${v.user.display} [${v.strategy}]`);
  const nomatch = Object.entries(umap).filter(([, v]) => !v.user);
  console.log(`Usuarios sin match (${nomatch.length}): ${nomatch.map(([k, v]) => `${k} [${v.strategy}]`).join(", ") || "—"}`);

  if (!APPLY) { console.log("(dry-run: no se escribió nada)"); return; }

  // ---- apply ----
  const bak = path.join(DATA, `access.json.bak-${Date.now()}`);
  fs.copyFileSync(path.join(DATA, "access.json"), bak);
  const now = Date.now();
  const takenMail = new Set((db.mails || []).map((m) => m.id));
  for (const dir of mailsACrear) {
    let areaName = wantMails.get(dir);
    if (!areaName) areaName = BECAS_CON_Y_AREA;
    const area = areaByName.get(norm(areaName));
    if (!area) throw new Error(`Área inexistente para ${dir}: ${areaName}`);
    let base = norm(dir.split("@")[0]).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "mail";
    let id = base, n = 2; while (takenMail.has(id)) id = `${base}-${n++}`;
    takenMail.add(id);
    const nm = { id, nombre: dir.split("@")[0], direccion: dir, areaId: area.id, createdAt: now, updatedAt: now };
    db.mails.push(nm);
    mailByDir.set(dir, nm);
  }
  const gmap = new Map((db.mailGrants || []).map((g) => [keyOf(g.accountId, g.userId), g]));
  for (const [k, g] of objetivo) {
    const ex = gmap.get(k);
    if (ex) { ex.canRead = g.canRead; ex.canSend = g.canSend; ex.userDisplay = g.display; ex.by = "import-definitivo"; ex.at = now; }
    else {
      const ng = { accountId: g.accountId, userId: g.userId, userDisplay: g.display, canSend: g.canSend, canRead: g.canRead, by: "import-definitivo", at: now };
      db.mailGrants.push(ng);
      gmap.set(k, ng);
    }
  }
  const keep = new Set(objetivo.keys());
  db.mailGrants = (db.mailGrants || []).filter((g) => keep.has(keyOf(g.accountId, g.userId)));
  const tmp = path.join(DATA, `access.json.${process.pid}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, path.join(DATA, "access.json"));
  const repPath = path.join(DATA, `import-definitivo-${Date.now()}.json`);
  const acc = db.mailGrants.filter((g) => g.canRead && g.canSend).length;
  const onlyR = db.mailGrants.filter((g) => g.canRead && !g.canSend).length;
  const onlyS = db.mailGrants.filter((g) => !g.canRead && g.canSend).length;
  fs.writeFileSync(repPath, JSON.stringify({ fecha: new Date().toISOString(), archivo: XLSX_PATH, crear, actualizar, eliminar, iguales, mailsACrear, skipped, backup: bak, totales: { mails: db.mails.length, mailGrants: db.mailGrants.length, ambos: acc, soloAcceso: onlyR, soloEnvio: onlyS } }, null, 2));
  console.log(`APLICADO. Backup: ${bak} | Reporte: ${repPath}`);
  console.log(`Totales: mails=${db.mails.length} mailGrants=${db.mailGrants.length} (ambos=${acc} solo-acceso=${onlyR} solo-envío=${onlyS})`);
}

main().catch((e) => { console.error("FALLO:", e.message); process.exit(1); });
