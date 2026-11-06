// Backfill único: completa userFirstname/userRealname en mailGrants/shareGrants
// consultando GLPI una vez por userId distinto.
//   node scripts/backfill-grant-names.mjs --dry-run   (solo reporte, no escribe)
//   node scripts/backfill-grant-names.mjs --apply      (backup + escribe)
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dir = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dir, "..");
const DATA = process.env.DATA_DIR || path.join(REPO, "data");
const API = process.env.API_BASE || "http://localhost:3000";
const APPLY = process.argv.includes("--apply");

async function getById(id) {
  const r = await fetch(`${API}/api/glpi/users?id=${id}`);
  const j = await r.json().catch(() => ({}));
  return r.ok && j.user ? j.user : null;
}

async function main() {
  const p = path.join(DATA, "access.json");
  const db = JSON.parse(fs.readFileSync(p, "utf8"));
  const ids = new Set();
  for (const g of db.mailGrants || []) if (!g.userRealname || !g.userFirstname) ids.add(g.userId);
  for (const g of db.shareGrants || []) if (!g.userRealname || !g.userFirstname) ids.add(g.userId);
  console.log(`userIds a resolver: ${ids.size}`);
  const umap = {};
  const missing = [];
  for (const id of [...ids].sort((a, b) => a - b)) {
    const u = await getById(id);
    if (u) umap[id] = u;
    else missing.push(id);
  }
  console.log(`resueltos: ${Object.keys(umap).length} | sin match: ${missing.join(", ") || "—"}`);
  let n = 0;
  for (const g of db.mailGrants || []) {
    const u = umap[g.userId];
    if (u && (!g.userRealname || !g.userFirstname)) {
      g.userFirstname = u.firstname || g.userFirstname || null;
      g.userRealname = u.realname || g.userRealname || null;
      if (!g.userDisplay) g.userDisplay = u.display || null;
      n++;
    }
  }
  for (const g of db.shareGrants || []) {
    const u = umap[g.userId];
    if (u && (!g.userRealname || !g.userFirstname)) {
      g.userFirstname = u.firstname || g.userFirstname || null;
      g.userRealname = u.realname || g.userRealname || null;
      if (!g.userDisplay) g.userDisplay = u.display || null;
      n++;
    }
  }
  console.log(`grants a completar: ${n}`);
  if (!APPLY) { console.log("(dry-run: no se escribió nada)"); return; }
  const bak = path.join(DATA, `access.json.bak-${Date.now()}`);
  fs.copyFileSync(p, bak);
  const tmp = path.join(DATA, `access.json.${process.pid}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, p);
  console.log(`APLICADO. Backup: ${bak} | grants completados: ${n} | sin match: ${missing.join(", ") || "—"}`);
}

main().catch((e) => { console.error("FALLO:", e.message); process.exit(1); });
