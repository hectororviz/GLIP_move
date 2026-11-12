#!/usr/bin/env node
// Migra ./data/*.json (config, floors, access, activity) a Postgres vía Prisma.
// Idempotente: --apply reemplaza el contenido PG en UNA transacción (todo o nada).
//
//   node scripts/migrate-json-to-pg.mjs --dry-run   # solo reporte, no escribe
//   node scripts/migrate-json-to-pg.mjs --apply      # migra y guarda reporte en data/
//
// Requiere DATABASE_URL (ver .env). No borra los JSON: quedan como respaldo.
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(__dirname, "..", "data");
const APPLY = process.argv.includes("--apply");

async function readJson(name, fallback) {
  try {
    return JSON.parse(await fs.readFile(path.join(DATA, name), "utf8"));
  } catch {
    return fallback;
  }
}

const normStr = (v, d = "") => (typeof v === "string" && v ? v : d);
const rutaKey = (v) => {
  let t = String(v || "").trim().replace(/\//g, "\\").replace(/\\{2,}/g, "\\");
  if (/^\\\\/.test(String(v || "").trim()) || /^\/\//.test(String(v || "").trim())) t = "\\\\" + t.replace(/^\\+/, "");
  if (t.length > 3) t = t.replace(/\\+$/, "");
  return t.toLowerCase();
};

async function main() {
  const config = await readJson("config.json", null);
  const floors = await readJson("floors.json", []);
  const access = await readJson("access.json", { areas: [], mails: [], shares: [], mailGrants: [], shareGrants: [] });
  const activity = await readJson("activity.json", []);

  const report = {
    fecha: new Date().toISOString(),
    apply: APPLY,
    config: config ? "presente" : "ausente (defaults)",
    floors: Array.isArray(floors) ? floors.length : 0,
    puestos: Array.isArray(floors) ? floors.reduce((a, f) => a + (f?.puestos?.length || 0), 0) : 0,
    areas: access.areas?.length || 0,
    mails: access.mails?.length || 0,
    shares: access.shares?.length || 0,
    mailGrants: access.mailGrants?.length || 0,
    shareGrants: access.shareGrants?.length || 0,
    activity: Array.isArray(activity) ? activity.length : 0,
  };

  // Validación previa: FKs y unicidades que PG va a exigir.
  const errors = [];
  const areaIds = new Set((access.areas || []).map((a) => a.id));
  for (const m of access.mails || []) {
    if (!areaIds.has(m.areaId)) errors.push(`mail ${m.id}: areaId inexistente ${m.areaId}`);
  }
  for (const s of access.shares || []) {
    if (!areaIds.has(s.areaId)) errors.push(`share ${s.id}: areaId inexistente ${s.areaId}`);
  }
  const dirs = new Set();
  for (const m of access.mails || []) {
    const k = String(m.direccion || "").toLowerCase();
    if (dirs.has(k)) errors.push(`mail duplicado: ${m.direccion}`);
    dirs.add(k);
  }
  const rks = new Set();
  for (const s of access.shares || []) {
    const k = rutaKey(s.ruta);
    if (rks.has(k)) errors.push(`share duplicado: ${s.ruta}`);
    rks.add(k);
  }
  report.errors = errors;

  console.log(JSON.stringify(report, null, 2));
  if (errors.length) {
    console.error("\nHay errores de integridad: corregir antes de --apply.");
    process.exit(2);
  }
  if (!APPLY) {
    console.log("\nDry-run OK. Re-ejecutar con --apply para escribir en Postgres.");
    return;
  }

  const db = new PrismaClient();
  try {
    await db.$transaction(async (tx) => {
      // config (upsert fila única)
      if (config) {
        await tx.appConfig.upsert({
          where: { id: 1 },
          create: {
            id: 1,
            glpiBaseUrl: normStr(config.glpiBaseUrl, "http://192.168.170.125").replace(/\/$/, ""),
            appToken: normStr(config.appToken),
            userTokenEnc: normStr(config.userTokenEnc),
            keepUserOnMove: config.keepUserOnMove ?? true,
            rootLocationId: config.rootLocationId ?? null,
            appName: normStr(config.appName, "GLPI Move").slice(0, 40),
            accentColor: config.accentColor || "#0b5ed7",
            brandIcon: config.brandIcon || null,
          },
          update: {
            glpiBaseUrl: normStr(config.glpiBaseUrl, "http://192.168.170.125").replace(/\/$/, ""),
            appToken: normStr(config.appToken),
            userTokenEnc: normStr(config.userTokenEnc),
            keepUserOnMove: config.keepUserOnMove ?? true,
            rootLocationId: config.rootLocationId ?? null,
            appName: normStr(config.appName, "GLPI Move").slice(0, 40),
            accentColor: config.accentColor || "#0b5ed7",
            brandIcon: config.brandIcon || null,
          },
        });
      }
      // floors + puestos (reemplazo)
      await tx.puesto.deleteMany();
      await tx.floor.deleteMany();
      for (let i = 0; i < (Array.isArray(floors) ? floors : []).length; i++) {
        const fl = floors[i];
        await tx.floor.create({
          data: {
            id: String(fl.id),
            name: String(fl.name || fl.id),
            image: fl.image || null,
            glpiLocationId: fl.glpiLocationId ?? null,
            sort: i,
            puestos: {
              create: (Array.isArray(fl.puestos) ? fl.puestos : [])
                .filter((p) => p && p.glpi_id != null)
                .map((p) => ({ glpiId: Number(p.glpi_id), x: Number(p.x) || 0, y: Number(p.y) || 0, w: Number(p.w) || 5, h: Number(p.h) || 5 })),
            },
          },
        });
      }
      // access (reemplazo, mismo orden que saveAccess)
      await tx.mailGrant.deleteMany();
      await tx.shareGrant.deleteMany();
      await tx.mail.deleteMany();
      await tx.share.deleteMany();
      await tx.area.deleteMany();
      for (const a of access.areas || []) {
        await tx.area.create({
          data: { id: a.id, nombre: a.nombre, responsableUserId: a.responsableUserId, responsableNombre: a.responsableNombre ?? null, createdAt: BigInt(a.createdAt || 0), updatedAt: BigInt(a.updatedAt || 0) },
        });
      }
      for (const m of access.mails || []) {
        await tx.mail.create({
          data: { id: m.id, nombre: m.nombre, direccion: m.direccion, areaId: m.areaId, createdAt: BigInt(m.createdAt || 0), updatedAt: BigInt(m.updatedAt || 0) },
        });
      }
      for (const s of access.shares || []) {
        await tx.share.create({
          data: { id: s.id, nombre: s.nombre, ruta: s.ruta, rutaKey: rutaKey(s.ruta), areaId: s.areaId, createdAt: BigInt(s.createdAt || 0), updatedAt: BigInt(s.updatedAt || 0) },
        });
      }
      for (const g of access.mailGrants || []) {
        await tx.mailGrant.create({
          data: { accountId: g.accountId, userId: g.userId, userDisplay: g.userDisplay ?? null, userFirstname: g.userFirstname ?? null, userRealname: g.userRealname ?? null, canSend: !!g.canSend, canRead: !!g.canRead, by: g.by ?? null, at: BigInt(g.at || 0) },
        });
      }
      for (const g of access.shareGrants || []) {
        await tx.shareGrant.create({
          data: { shareId: g.shareId, userId: g.userId, userDisplay: g.userDisplay ?? null, userFirstname: g.userFirstname ?? null, userRealname: g.userRealname ?? null, by: g.by ?? null, at: BigInt(g.at || 0) },
        });
      }
      // activity (solo si el log PG está vacío → idempotente)
      const n = await tx.activity.count();
      if (n === 0 && Array.isArray(activity)) {
        for (const e of activity.slice(-100)) {
          if (!e || typeof e !== "object") continue;
          await tx.activity.create({
            data: { ts: BigInt(e.ts || 0), actor: normStr(e.actor), action: normStr(e.action), type: normStr(e.type), glpiId: Number(e.id) || 0, locationId: e.location_id ?? null, userId: e.user_id ?? null },
          });
        }
      }
      report.activityImportados = n === 0 ? (Array.isArray(activity) ? Math.min(activity.length, 100) : 0) : 0;
      report.activityPrevios = n;
    });
    report.ok = true;
    const out = path.join(DATA, `import-pg-report-${Date.now()}.json`);
    await fs.writeFile(out, JSON.stringify(report, null, 2), "utf8");
    console.log(`\nMigración OK. Reporte: ${out}`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error("Fallo migración:", e.message);
  process.exit(1);
});
