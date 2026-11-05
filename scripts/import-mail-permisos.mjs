// Importa el relevamiento "Permisos correos inst.xlsx" a data/access.json.
//   node scripts/import-mail-permisos.mjs --dry-run   (solo reporte, no escribe)
//   node scripts/import-mail-permisos.mjs --apply      (backup + escribe + reporte JSON)
// Reglas: match GLPI multi-estrategia (apellido-exacto-primero, overrides),
// mapeo sin-punto->con-punto, canSend=true preservando canRead, sin borrar nada.
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
  : "/home/horviz/Documentos/Permisos correos inst.xlsx";
const APPLY = process.argv.includes("--apply");

const norm = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
const normMail = (s) => String(s || "").trim().toLowerCase();

// Decididos con el usuario (no adivinar):
const OVERRIDES = {
  "dall armelina": 180, // DALL' ARMELLINA (el apóstrofe rompe el searchText)
  leone: 51,            // Yanina LEONE (#137 es Lucas Leonel REY, otra persona)
  alvarez: 77,          // Sergio ALVAREZ para rendicionesfoncyt@
  diaz: 122,            // Mariano DIAZ para meys@
};
const DOTMAP = {
  "convocatoriaconsorcios@agencia.gob.ar": "convocatoria.consorcios@agencia.gob.ar",
  "convocatoriastartup@agencia.gob.ar": "convocatoria.startup@agencia.gob.ar",
};
const PENDING_MAILS = new Set(["becasymaestriasdgfeyl@agencia.gob.ar"]); // difiere de Hoja2, no adivinar
const DROPPED_USERS = new Set(["constanzo"]);

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

async function resolveUser(surname) {
  const key = norm(surname);
  if (OVERRIDES[key] !== undefined) {
    const u = await getById(OVERRIDES[key]);
    return { user: u, strategy: u ? "override" : "override-missing", candidates: [] };
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
  // apellido-exacto-primero: realname contiene la consulta normalizada
  const exact = cands.filter((u) => norm(u.realname).includes(key));
  if (!exact.length) return { user: null, strategy: "no-exact-surname", candidates: cands };
  return { user: exact[exact.length - 1], strategy: exact.length > 1 ? "exact-highest-id" : "exact-unique", candidates: cands };
}

function loadDb() {
  return JSON.parse(fs.readFileSync(path.join(DATA, "access.json"), "utf8"));
}

async function main() {
  const wb = XLSX.readFile(XLSX_PATH);
  const h1 = XLSX.utils.sheet_to_json(wb.Sheets["Hoja1"], { header: 1, defval: null }).slice(1).filter((r) => r[0] || r[1]);
  const h2 = XLSX.utils.sheet_to_json(wb.Sheets["Hoja2"], { header: 1, defval: null }).slice(1).filter((r) => r[0]);
  const db = loadDb();
  const areaByName = new Map((db.areas || []).map((a) => [norm(a.nombre), a]));
  const mailByDir = new Map((db.mails || []).map((m) => [normMail(m.direccion), m]));
  const grantKey = new Set((db.mailGrants || []).map((g) => `${g.accountId}|${g.userId}`));

  const catalog = new Map(); // direccion -> area
  h2.forEach((r) => catalog.set(normMail(r[0]), String(r[1]).trim()));

  // 1) usuarios únicos
  const surnames = [...new Set(h1.map((r) => String(r[0]).trim()))].sort();
  const umap = {};
  for (const s of surnames) {
    if (DROPPED_USERS.has(norm(s))) { umap[s] = { user: null, strategy: "dropped-by-user", candidates: [] }; continue; }
    umap[s] = await resolveUser(s);
  }

  // 2) áreas y mails a crear
  const areasToCreate = [];
  for (const a of new Set(h2.map((r) => String(r[1]).trim()))) {
    if (!areaByName.has(norm(a))) areasToCreate.push(a);
  }
  const mailsToCreate = [];
  for (const [dir, area] of catalog) {
    if (!mailByDir.has(dir)) mailsToCreate.push({ direccion: dir, area });
  }
  const areaIdFor = (areaName) => {
    const ex = areaByName.get(norm(areaName));
    if (ex) return ex.id;
    const slug = norm(areaName).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "area";
    return slug;
  };

  // 3) grants fila por fila
  const grantOps = [];
  const skipped = [];
  for (const r of h1) {
    const sname = String(r[0]).trim();
    let dir = normMail(r[1]);
    const rowArea = r[2] == null ? null : String(r[2]).trim();
    if (DOTMAP[dir]) dir = DOTMAP[dir];
    if (PENDING_MAILS.has(dir)) { skipped.push({ fila: [sname, r[1], r[2]], motivo: "mail pendiente de definir (becas...)" }); continue; }
    const res = umap[sname];
    if (!res || !res.user) { skipped.push({ fila: [sname, r[1], r[2]], motivo: `usuario sin match (${res ? res.strategy : "?"})` }); continue; }
    const area = catalog.get(dir) || rowArea;
    if (!area || area === "null") { skipped.push({ fila: [sname, r[1], r[2]], motivo: "sin área resoluble" }); continue; }
    grantOps.push({ surname: sname, userId: res.user.id, display: res.user.display, direccion: dir, area });
  }

  // 4) clasificar grants nuevos vs updates (con ids finales)
  const mailIdFor = (dir, area) => {
    const ex = mailByDir.get(dir);
    if (ex) return ex.id;
    const base = norm(dir.split("@")[0]).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    let id = base, n = 2;
    const taken = new Set([...mailByDir.values()].map((m) => m.id));
    while (taken.has(id)) id = `${base}-${n++}`;
    return id;
  };
  let creates = 0, updates = 0;
  for (const g of grantOps) {
    const m = mailByDir.get(g.direccion);
    const id = m ? m.id : mailIdFor(g.direccion, g.area);
    if (grantKey.has(`${id}|${g.userId}`)) { updates++; g.accion = "update-canSend"; }
    else { creates++; g.accion = "create"; }
    g.accountId = id;
  }

  const report = {
    fecha: new Date().toISOString(),
    archivo: XLSX_PATH,
    filasHoja1: h1.length,
    mailsHoja2: h2.length,
    areasACrear: areasToCreate,
    mailsACrear: mailsToCreate.map((m) => m.direccion),
    grantsCrear: creates,
    grantsActualizar: updates,
    filasSaltadas: skipped,
    usuarios: Object.fromEntries(Object.entries(umap).map(([k, v]) => [k, v.user ? { id: v.user.id, display: v.user.display, strategy: v.strategy, candidatos: v.candidates.length } : { strategy: v.strategy, candidatos: (v.candidates || []).map((c) => `#${c.id} ${c.display}`) }])),
  };

  console.log("=== DRY-RUN import-mail-permisos ===");
  console.log(`Filas Hoja1: ${h1.length} | Mails Hoja2: ${h2.length}`);
  console.log(`Áreas a crear (${areasToCreate.length}): ${areasToCreate.join(" | ")}`);
  console.log(`Mails a crear (${mailsToCreate.length})`);
  console.log(`Grants: crear=${creates} actualizar=${updates} | Saltadas: ${skipped.length}`);
  for (const s of skipped) console.log("  SKIP", JSON.stringify(s.fila), "-", s.motivo);
  const multi = Object.entries(umap).filter(([, v]) => v.user && v.candidates.length > 1);
  console.log(`Usuarios con >1 candidato (${multi.length}):`);
  for (const [k, v] of multi) console.log(`  ${k} -> #${v.user.id} ${v.user.display} [${v.strategy}] (cands: ${v.candidates.map((c) => `#${c.id} ${c.display}`).join("; ")})`);
  const nomatch = Object.entries(umap).filter(([, v]) => !v.user);
  console.log(`Usuarios sin match (${nomatch.length}): ${nomatch.map(([k, v]) => `${k} [${v.strategy}]`).join(", ")}`);

  if (!APPLY) { console.log("(dry-run: no se escribió nada)"); return; }

  // ---- apply ----
  const bak = path.join(DATA, `access.json.bak-${Date.now()}`);
  fs.copyFileSync(path.join(DATA, "access.json"), bak);
  const now = Date.now();
  const takenArea = new Set((db.areas || []).map((a) => a.id));
  for (const a of areasToCreate) {
    let id = norm(a).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "area";
    let n = 2; while (takenArea.has(id)) id += `-${n++}`;
    takenArea.add(id);
    const na = { id, nombre: a, responsableUserId: 0, responsableNombre: null, createdAt: now, updatedAt: now };
    db.areas.push(na);
    areaByName.set(norm(a), na);
  }
  const takenMail = new Set((db.mails || []).map((m) => m.id));
  for (const m of mailsToCreate) {
    const area = areaByName.get(norm(m.area));
    if (!area) throw new Error(`Área inexistente para ${m.direccion}: ${m.area}`);
    let base = norm(m.direccion.split("@")[0]).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "mail";
    let id = base, n = 2; while (takenMail.has(id)) id = `${base}-${n++}`;
    takenMail.add(id);
    const nm = { id, nombre: m.direccion.split("@")[0], direccion: m.direccion, areaId: area.id, createdAt: now, updatedAt: now };
    db.mails.push(nm);
    mailByDir.set(m.direccion, nm);
  }
  const gmap = new Map((db.mailGrants || []).map((g) => [`${g.accountId}|${g.userId}`, g]));
  for (const g of grantOps) {
    const ex = gmap.get(`${g.accountId}|${g.userId}`);
    if (ex) { ex.canSend = true; ex.userDisplay = g.display; ex.by = "import-xlsx"; ex.at = now; }
    else {
      const ng = { accountId: g.accountId, userId: g.userId, userDisplay: g.display, canSend: true, canRead: false, by: "import-xlsx", at: now };
      db.mailGrants.push(ng);
      gmap.set(`${g.accountId}|${g.userId}`, ng);
    }
  }
  const tmp = path.join(DATA, `access.json.${process.pid}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, path.join(DATA, "access.json"));
  const repPath = path.join(DATA, `import-report-${Date.now()}.json`);
  fs.writeFileSync(repPath, JSON.stringify({ ...report, aplicada: true, backup: bak }, null, 2));
  console.log(`APLICADO. Backup: ${bak} | Reporte: ${repPath}`);
  console.log(`Totales: áreas=${db.areas.length} mails=${db.mails.length} mailGrants=${db.mailGrants.length}`);
}

main().catch((e) => { console.error("FALLO:", e.message); process.exit(1); });
