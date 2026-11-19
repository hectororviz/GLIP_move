// Importa internos (Location.room) desde puestos.xlsx — solo seguros.
//   node scripts/import-puestos.mjs --dry-run   (no escribe en GLPI)
//   node scripts/import-puestos.mjs --apply      (PUT room en GLPI + backup + reportes)
// Reglas usuario: solo pisos 1-4, Rubio 4,401 válido, Ferro descartado (baja).
import { createRequire } from "module";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

const __dir = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dir, "..");
const DATA = process.env.DATA_DIR || path.join(REPO, "data");
const XLSX_PATH = process.argv[2] && !process.argv[2].startsWith("--")
  ? process.argv[2]
  : "/home/horviz/Documentos/puestos.xlsx";
const APPLY = process.argv.includes("--apply");

const PISO_MAP = { "1": 344, "2": 341, "3": 339, "4": 4 };
const FERRO = "ferro mauro";

function norm(s) { return String(s ?? "").trim(); }
function numOfGLPI(name) {
  let m = String(name).match(/puesto\s*0*(\d+)/i);
  if (m) return parseInt(m[1], 10);
  m = String(name).match(/oficina\s*0*(\d+)/i);
  if (m) return parseInt(m[1], 10);
  m = String(name).match(/(201\/202)/);
  if (m) return 201;
  return null;
}

// --- GLPI service session (igual que lib/glpi.ts, vía data/config.json) ---
import crypto from "crypto";
function key32() {
  const k = process.env.CONFIG_KEY || "cambia-esta-clave-de-32-caracteres-minimo-123456";
  return crypto.createHash("sha256").update(k).digest();
}
function decrypt(payload) {
  if (!payload || !payload.includes(":")) return payload || "";
  try {
    const [ivs, tags, data] = payload.split(":");
    const d = crypto.createDecipheriv("aes-256-gcm", key32(), Buffer.from(ivs, "hex"));
    d.setAuthTag(Buffer.from(tags, "hex"));
    return Buffer.concat([d.update(Buffer.from(data, "hex")), d.final()]).toString("utf8");
  } catch { return ""; }
}
let sessionTok = null;
async function glpiInit(base, appToken, userToken) {
  const r = await fetch(`${base}/initSession`, { headers: { "Content-Type": "application/json", Authorization: `user_token ${userToken}`, "App-Token": appToken } });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j?.session_token) throw new Error(`initSession ${r.status}: ${JSON.stringify(j)?.slice(0,200)}`);
  return j.session_token;
}
async function glpiGet(base, appToken, tok, p) {
  const r = await fetch(`${base}${p}`, { headers: { "Session-Token": tok, "App-Token": appToken } });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`GLPI GET ${r.status} ${p}: ${JSON.stringify(j)?.slice(0,200)}`);
  return j;
}
async function glpiPut(base, appToken, tok, p, body) {
  const r = await fetch(`${base}${p}`, { method: "PUT", headers: { "Content-Type": "application/json", "Session-Token": tok, "App-Token": appToken }, body: JSON.stringify(body) });
  const t = await r.text();
  let j = null; try { j = t ? JSON.parse(t) : null; } catch { j = t; }
  if (!r.ok) throw new Error(`GLPI PUT ${r.status} ${p}: ${String(Array.isArray(j) ? j.join(";") : j?.message || t).slice(0,300)}`);
  return j;
}

async function main() {
  const cfg = JSON.parse(fs.readFileSync(path.join(DATA, "config.json"), "utf8"));
  const base = cfg.glpiBaseUrl.replace(/\/$/, "") + "/apirest.php";
  const userToken = decrypt(cfg.userTokenEnc);
  if (!cfg.appToken || !userToken) throw new Error("Faltan tokens GLPI en data/config.json");

  const wb = XLSX.readFile(XLSX_PATH);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  const data = rows.slice(1)
    .map((r) => ({ persona: norm(r[0]), organismo: norm(r[1]), sector: norm(r[2]).replace(/\s+$/, ""), piso: norm(r[3]), puesto: norm(r[4]), interno: norm(r[5]) }))
    .filter((d) => d.persona || d.piso || d.puesto || d.interno);

  const floors = JSON.parse(fs.readFileSync(path.join(DATA, "floors.json"), "utf8"));
  const drawn = new Set(floors.flatMap((f) => f.puestos.map((p) => Number(p.glpi_id))));

  const tok = await glpiInit(base, cfg.appToken, userToken);
  let locs = [];
  for (let s = 0; ; s += 200) {
    const l = await glpiGet(base, cfg.appToken, tok, `/Location/?range=${s}-${s + 199}`);
    if (!Array.isArray(l) || !l.length) break;
    locs.push(...l);
    if (l.length < 200) break;
    if (s > 5000) break;
  }
  const byPidNum = new Map();
  for (const l of locs) {
    const n = numOfGLPI(l.name);
    if (n == null) continue;
    byPidNum.set(`${Number(l.locations_id)}|${n}`, l);
  }
  const byId = new Map(locs.map((l) => [Number(l.id), l]));
  const cleanRoom = (v) => (v == null ? null : String(v).trim() || null);

  const seguros = [], problemas = [], descartados = [];
  const seenInterno = new Map();
  // duplicados estáticos (excluyendo Ferro que va a descartados)
  const counts = {};
  for (const d of data) {
    if (!d.interno || d.persona.toLowerCase() === FERRO) continue;
    counts[d.interno] = (counts[d.interno] || 0) + 1;
  }
  for (const d of data) {
    const tag = `${d.persona} | ${d.piso},${d.puesto},${d.interno}`;
    if (d.persona.toLowerCase() === FERRO) { descartados.push({ ...d, motivo: "baja Agencia (descartado por usuario)" }); continue; }
    if (!["1","2","3","4"].includes(d.piso)) { problemas.push({ ...d, motivo: "fuera de alcance (PB, solo 1-4)" }); continue; }
    if (!d.persona) { problemas.push({ ...d, motivo: "persona vacía" }); continue; }
    if (!d.interno) { problemas.push({ ...d, motivo: "interno vacío" }); continue; }
    if (counts[d.interno] > 1) { problemas.push({ ...d, motivo: `interno duplicado ${d.interno} x${counts[d.interno]}` }); continue; }
    // especiales: solo 401 válido (Rubio)
    if (!/^\d+$/.test(d.puesto) || Number(d.puesto) < 1 || Number(d.puesto) > 61) {
      const isRubio401 = d.piso === "4" && d.puesto === "401" && d.interno === "8098";
      if (!isRubio401) { problemas.push({ ...d, motivo: `puesto especial fuera de rango 1-61 (${d.puesto})` }); continue; }
    }
    const pid = PISO_MAP[d.piso];
    const want = Number(d.puesto);
    const gl = byPidNum.get(`${pid}|${want}`);
    if (!gl) { problemas.push({ ...d, motivo: `puesto inexistente en GLPI (piso pid ${pid} + puesto ${want})` }); continue; }
    if (!drawn.has(Number(gl.id))) { problemas.push({ ...d, motivo: `puesto no dibujado en floors.json (glpi_id ${gl.id} ${gl.name})`, glpi_id: gl.id }); continue; }
    const actual = cleanRoom(gl.room);
    if (actual === d.interno) { seguros.push({ ...d, glpi_id: Number(gl.id), glpi_name: gl.name, roomActual: actual, accion: "igual" }); continue; }
    seguros.push({ ...d, glpi_id: Number(gl.id), glpi_name: gl.name, roomActual: actual, accion: "actualizar" });
  }

  const aActualizar = seguros.filter((s) => s.accion === "actualizar");
  const iguales = seguros.filter((s) => s.accion === "igual");
  console.log("=== DRY-RUN import-puestos ===");
  console.log(`Filas: ${data.length} | seguros: ${seguros.length} (actualizar=${aActualizar.length} iguales=${iguales.length}) | problemas: ${problemas.length} | descartados: ${descartados.length}`);
  for (const p of problemas) console.log("  PROBLEMA", JSON.stringify(p));
  for (const d of descartados) console.log("  DESCARTADO", JSON.stringify(d));
  console.log(`  IGUALES (${iguales.length}):`, iguales.map((s) => `${s.glpi_id}:${s.glpi_name}=${s.interno}`).join(", ") || "—");

  if (!APPLY) { console.log("(dry-run: no se escribió nada en GLPI)"); return; }

  // backup rooms actuales de los afectados
  const bak = { fecha: new Date().toISOString(), items: aActualizar.map((s) => ({ id: s.glpi_id, name: s.glpi_name, roomAntes: s.roomActual, roomNuevo: s.interno, persona: s.persona })) };
  fs.writeFileSync(path.join(DATA, `puestos-rooms-bak-${Date.now()}.json`), JSON.stringify(bak, null, 2));
  let ok = 0; const errores = [];
  for (const s of aActualizar) {
    try {
      await glpiPut(base, cfg.appToken, tok, `/Location/${s.glpi_id}?session_write=true`, { input: { room: s.interno } });
      ok++;
      if (ok % 20 === 0) console.log(`  ... ${ok}/${aActualizar.length}`);
    } catch (e) { errores.push({ ...s, error: e.message }); }
  }
  const ts = Date.now();
  fs.writeFileSync(path.join(DATA, `import-puestos-${ts}.json`), JSON.stringify({ fecha: new Date().toISOString(), archivo: XLSX_PATH, total: data.length, actualizar: aActualizar.length, aplicados: ok, errores: errores.length, iguales: iguales.length, problemas: problemas.length, descartados, detalleErrores: errores }, null, 2));
  const csvHead = "persona;piso;puesto;interno;glpi_id;motivo\n";
  const csvRows = [...problemas.map((p) => `${p.persona};${p.piso};${p.puesto};${p.interno};${p.glpi_id || ""};${p.motivo}`), ...descartados.map((p) => `${p.persona};${p.piso};${p.puesto};${p.interno};;${p.motivo}`)].join("\n");
  fs.writeFileSync(path.join(DATA, `import-puestos-problemas-${ts}.csv`), csvHead + csvRows + "\n");
  console.log(`APLICADO: ok=${ok} errores=${errores.length} iguales=${iguales.length} problemas=${problemas.length}`);
  for (const e of errores.slice(0, 10)) console.log("  ERROR", JSON.stringify(e));
}

main().catch((e) => { console.error("FALLO:", e.message); process.exit(1); });
