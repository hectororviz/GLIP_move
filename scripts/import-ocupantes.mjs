// Pisa ocupantes (users_id en bienes) desde relevamiento físico puestos.xlsx.
//   node scripts/import-ocupantes.mjs --dry-run
//   node scripts/import-ocupantes.mjs --apply
// Regla usuario: el informe físico mata registro previo -> se sobrescribe users_id.
import { createRequire } from "module";
import fs from "fs";
import path from "path";
import crypto from "crypto";
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
const ASSET_TYPES = ["Computer", "Monitor", "Phone", "Printer", "Peripheral", "NetworkEquipment"];

const norm = (s) => String(s ?? "").trim();
const normKey = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z ]+/g, " ").replace(/\s+/g, " ").trim();
function numOfGLPI(name) {
  let m = String(name).match(/puesto\s*0*(\d+)/i);
  if (m) return parseInt(m[1], 10);
  m = String(name).match(/oficina\s*0*(\d+)/i);
  if (m) return parseInt(m[1], 10);
  if (/201\/202/.test(String(name))) return 201;
  return null;
}
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
async function glpiInit(base, appToken, userToken) {
  const r = await fetch(`${base}/initSession`, { headers: { "Content-Type": "application/json", Authorization: `user_token ${userToken}`, "App-Token": appToken } });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j?.session_token) throw new Error(`initSession ${r.status}`);
  return j.session_token;
}
async function gGet(base, appToken, tok, p) {
  const r = await fetch(`${base}${p}`, { headers: { "Session-Token": tok, "App-Token": appToken } });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`GET ${r.status} ${p}: ${JSON.stringify(j)?.slice(0,200)}`);
  return j;
}
async function gPut(base, appToken, tok, p, body) {
  const r = await fetch(`${base}${p}`, { method: "PUT", headers: { "Content-Type": "application/json", "Session-Token": tok, "App-Token": appToken }, body: JSON.stringify(body) });
  const t = await r.text();
  let j = null; try { j = t ? JSON.parse(t) : null; } catch { j = t; }
  if (!r.ok) throw new Error(`PUT ${r.status} ${p}: ${String(Array.isArray(j) ? j.join(";") : t).slice(0,300)}`);
  return j;
}

// --- resolución persona -> user (igual criterio que import-definitivo) ---
const OVERRIDES_FULL = {
  "sosa paola": 86, "sosa veronica": 195,
  "magenetto maia": 116, "magnetto maia": 116,
  "constanzo brenda": 192, "costanzo brenda": 192,
  "eran salamendi cesar": 186, "pera reanual enrique": 176,
  "albarracin frnazone martin": 133,
};
const OVERRIDES_SURNAME = {
  "dall armelina": 180, leone: 51, alvarez: 77, diaz: 122,
  leguizamon: 61, sala: 107, ramos: 110, rodriguez: 58,
  zaldua: 130, magenetto: 116, magnetto: 116, constanzo: 192, costanzo: 192,
};
function tokensOf(persona) {
  return String(persona).trim().split(/\s+/).filter(Boolean);
}
async function searchUsers(base, appToken, tok, q) {
  const r = await fetch(`${base}/User/?searchText[realname]=${encodeURIComponent(q)}&expand_dropdowns=true&range=0-20`, { headers: { "Session-Token": tok, "App-Token": appToken } });
  const j = await r.json().catch(() => []);
  return Array.isArray(j) ? j : [];
}
async function getUserById(base, appToken, tok, id) {
  try {
    const j = await gGet(base, appToken, tok, `/User/${id}?expand_dropdowns=true`);
    return j && j.id ? j : null;
  } catch { return null; }
}
async function resolvePersona(base, appToken, tok, persona) {
  const full = normKey(persona);
  if (OVERRIDES_FULL[full] !== undefined) {
    const u = await getUserById(base, appToken, tok, OVERRIDES_FULL[full]);
    return { user: u, strategy: u ? "override-full" : "override-missing", candidates: [] };
  }
  const toks = tokensOf(persona);
  // apellido para override: primer token (o "DALL ARMELLINA" / "X,")
  let surKey = "";
  if (toks.length) {
    if (/,$/.test(toks[0])) surKey = normKey(toks[0].replace(/,$/, ""));
    else if (/^dall$/i.test(toks[0]) && toks.length > 1) surKey = normKey(`${toks[0]} ${toks[1]}`);
    else surKey = normKey(toks[0]);
  }
  // overrides por apellido solo si hay un único candidato razonable; si no, se sigue a match exacto
  const queries = [];
  if (toks.length >= 1) queries.push(toks[0].replace(/,$/, ""));
  if (toks.length >= 2) queries.push(`${toks[0].replace(/,$/, "")} ${toks[1]}`);
  const seen = new Map();
  for (const qq of [...new Set(queries)]) {
    if (qq.length < 2) continue;
    for (const u of await searchUsers(base, appToken, tok, qq)) seen.set(u.id, u);
    if (qq.includes("'")) {
      for (const u of await searchUsers(base, appToken, tok, qq.replace(/'/g, " "))) seen.set(u.id, u);
    }
  }
  const cands = [...seen.values()].sort((a, b) => a.id - b.id);
  // match exacto nombre completo: realname + firstname == persona
  const exactFull = cands.filter((u) => normKey(`${u.realname || ""} ${u.firstname || ""}`) === full);
  if (exactFull.length) {
    const act = exactFull.filter((u) => Number(u.is_active) === 1 && Number(u.is_deleted) !== 1);
    const pool = act.length ? act : exactFull;
    return { user: pool[pool.length - 1], strategy: pool.length > 1 ? "exact-full-highest-id" : "exact-full-unique", candidates: cands };
  }
  // fallback: override por apellido si existe
  if (OVERRIDES_SURNAME[surKey] !== undefined) {
    const u = await getUserById(base, appToken, tok, OVERRIDES_SURNAME[surKey]);
    return { user: u, strategy: u ? "override-surname" : "override-missing", candidates: cands };
  }
  // fallback: realname == primer apellido y firstname empieza igual (tolerante)
  const first = toks[0]?.replace(/,$/, "") || "";
  const loose = cands.filter((u) => normKey(u.realname) === normKey(first) || normKey(u.realname) === surKey);
  if (loose.length === 1) return { user: loose[0], strategy: "loose-surname-unique", candidates: cands };
  return { user: null, strategy: cands.length ? "ambiguo-sin-full-match" : "no-candidates", candidates: cands };
}

async function main() {
  const cfg = JSON.parse(fs.readFileSync(path.join(DATA, "config.json"), "utf8"));
  const base = cfg.glpiBaseUrl.replace(/\/$/, "") + "/apirest.php";
  const userToken = decrypt(cfg.userTokenEnc);
  const tok = await glpiInit(base, cfg.appToken, userToken);

  const wb = XLSX.readFile(XLSX_PATH);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" });
  const data = rows.slice(1).map((r) => ({ persona: norm(r[0]), piso: norm(r[3]), puesto: norm(r[4]), interno: norm(r[5]) })).filter((d) => d.persona || d.piso);

  let locs = [];
  for (let s = 0; ; s += 200) {
    const l = await gGet(base, cfg.appToken, tok, `/Location/?range=${s}-${s + 199}`);
    if (!Array.isArray(l) || !l.length) break;
    locs.push(...l);
    if (l.length < 200) break;
  }
  const floors = JSON.parse(fs.readFileSync(path.join(DATA, "floors.json"), "utf8"));
  const drawn = new Set(floors.flatMap((f) => f.puestos.map((p) => Number(p.glpi_id))));
  const byPidNum = new Map();
  for (const l of locs) {
    const n = numOfGLPI(l.name);
    if (n == null) continue;
    byPidNum.set(`${Number(l.locations_id)}|${n}`, l);
  }
  const counts = {};
  for (const d of data) {
    if (!d.interno || d.persona.toLowerCase() === FERRO) continue;
    counts[d.interno] = (counts[d.interno] || 0) + 1;
  }

  // seguros = misma regla que import-puestos (Rubio 401 ok, Ferro fuera, sin PB/101/201/301, dibujados, con match)
  const seguros = [];
  const excluidos = [];
  for (const d of data) {
    if (d.persona.toLowerCase() === FERRO) { excluidos.push({ ...d, motivo: "descartado" }); continue; }
    if (!["1","2","3","4"].includes(d.piso)) { excluidos.push({ ...d, motivo: "PB" }); continue; }
    if (!d.persona || !d.interno || counts[d.interno] > 1) { excluidos.push({ ...d, motivo: "vacio/duplicado" }); continue; }
    if (!/^\d+$/.test(d.puesto) || +d.puesto < 1 || +d.puesto > 61) {
      if (!(d.piso === "4" && d.puesto === "401")) { excluidos.push({ ...d, motivo: "especial" }); continue; }
    }
    const gl = byPidNum.get(`${PISO_MAP[d.piso]}|${Number(d.puesto)}`);
    if (!gl || !drawn.has(Number(gl.id))) { excluidos.push({ ...d, motivo: "sin-match/no-dibujado" }); continue; }
    seguros.push({ ...d, glpi_id: Number(gl.id), glpi_name: gl.name });
  }

  console.log(`Seguros a procesar: ${seguros.length} (excluidos ${excluidos.length})`);
  // 1)resolver usuarios
  const umap = {};
  for (const s of seguros) {
    if (!umap[s.persona]) umap[s.persona] = await resolvePersona(base, cfg.appToken, tok, s.persona);
  }
  const noUser = Object.entries(umap).filter(([, v]) => !v.user);
  console.log(`Personas únicas: ${Object.keys(umap).length} sin-match: ${noUser.length}`);
  noUser.slice(0,20).forEach(([k,v]) => console.log(`  SIN USER ${k} [${v.strategy}] cands=${v.candidates.map(c=>c.id+':'+c.realname).join('|').slice(0,120)}`));

  // 2)relevar bienes
  let planes = [], sinBienes = [], sinUser = [];
  for (const s of seguros) {
    const res = umap[s.persona];
    if (!res.user) { sinUser.push({ ...s, motivo: `usuario sin match [${res.strategy}]` }); continue; }
    let items = [];
    for (const t of ASSET_TYPES) {
      try {
        const l = await gGet(base, cfg.appToken, tok, `/${t}/?searchText[locations_id]=${s.glpi_id}&expand_dropdowns=true&range=0-100`);
        if (Array.isArray(l)) for (const it of l) items.push({ _type: t, id: Number(it.id), name: it.name, users_id: it.users_id == null ? null : Number(it.users_id) });
      } catch (e) { /* tipo sin resultados */ }
    }
    if (!items.length) { sinBienes.push({ ...s, userId: res.user.id, motivo: "puesto sin bienes" }); continue; }
    const aPisar = items.filter((a) => a.users_id !== Number(res.user.id));
    planes.push({ ...s, userId: Number(res.user.id), userDisplay: `${res.user.realname||""} ${res.user.firstname||""}`.trim(), total: items.length, yaIguales: items.length - aPisar.length, aPisar, items });
  }
  const totalBienes = planes.reduce((a,p)=>a+p.total,0);
  const totalPisar = planes.reduce((a,p)=>a+p.aPisar.length,0);
  console.log(`Con bienes: ${planes.length} puestos, ${totalBienes} bienes, a pisar: ${totalPisar} | sin bienes: ${sinBienes.length} | sin user: ${sinUser.length}`);
  planes.slice(0,10).forEach((p) => console.log(`  ${p.piso},${p.puesto} id${p.glpi_id} ${p.persona}->#${p.userId} bienes=${p.total} pisar=${p.aPisar.length}`));

  if (!APPLY) { console.log("(dry-run: no se escribió nada)"); return; }

  const bak = { fecha: new Date().toISOString(), items: planes.flatMap((p) => p.items.map((a) => ({ type: a._type, id: a.id, location_id: p.glpi_id, usersAntes: a.users_id, usersNuevo: p.userId, persona: p.persona }))) };
  fs.writeFileSync(path.join(DATA, `ocupantes-users-bak-${Date.now()}.json`), JSON.stringify(bak, null, 2));
  let ok = 0; const errores = [];
  for (const p of planes) {
    for (const a of p.aPisar) {
      try {
        await gPut(base, cfg.appToken, tok, `/${a._type}/${a.id}?session_write=true`, { input: { users_id: p.userId } });
        ok++;
      } catch (e) { errores.push({ puesto: `${p.piso},${p.puesto}`, glpi_id: p.glpi_id, type: a._type, id: a.id, persona: p.persona, error: e.message }); }
    }
    if (ok % 50 === 0) console.log(`  ... ${ok}/${totalPisar}`);
  }
  const ts = Date.now();
  fs.writeFileSync(path.join(DATA, `import-ocupantes-${ts}.json`), JSON.stringify({ fecha: new Date().toISOString(), puestos: planes.length, bienes: totalBienes, pisados: ok, errores: errores.length, sinBienes: sinBienes.length, sinUser: sinUser.length, detalleErrores: errores.slice(0,50) }, null, 2));
  const csv = "persona;piso;puesto;interno;glpi_id;userId;motivo\n" + [...sinBienes.map((s) => `${s.persona};${s.piso};${s.puesto};${s.interno};${s.glpi_id};${s.userId};${s.motivo}`), ...sinUser.map((s) => `${s.persona};${s.piso};${s.puesto};${s.interno};${s.glpi_id||""};;${s.motivo}`)].join("\n") + "\n";
  fs.writeFileSync(path.join(DATA, `import-ocupantes-problemas-${ts}.csv`), csv);
  console.log(`APLICADO ocupantes: ok=${ok}/${totalPisar} errores=${errores.length}`);
  errores.slice(0,10).forEach((e) => console.log("  ERROR", JSON.stringify(e)));
}

main().catch((e) => { console.error("FALLO:", e.message); process.exit(1); });
