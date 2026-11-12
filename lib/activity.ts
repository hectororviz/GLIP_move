import { promises as fs } from "fs";
import path from "path";
import { dataDir } from "./config";
import { prisma, usePostgres } from "./db";

export type ActivityEntry = {
  ts: number;
  actor: string;
  action: string;
  type: string;
  id: number;
  location_id?: number | null;
  user_id?: number | null;
};

const MAX_ENTRIES = 100;

async function activityPath(): Promise<string> {
  const d = dataDir();
  await fs.mkdir(d, { recursive: true });
  return path.join(d, "activity.json");
}

export async function readActivity(limit = 10): Promise<ActivityEntry[]> {
  if (usePostgres()) {
    try {
      const rows = await prisma().activity.findMany({
        orderBy: { id: "desc" },
        take: limit,
      });
      return rows.map((r) => ({
        ts: Number(r.ts),
        actor: r.actor,
        action: r.action,
        type: r.type,
        id: r.glpiId,
        location_id: r.locationId,
        user_id: r.userId,
      }));
    } catch {
      return [];
    }
  }
  try {
    const j = JSON.parse(await fs.readFile(await activityPath(), "utf8"));
    if (!Array.isArray(j)) return [];
    return j.slice(-limit).reverse();
  } catch {
    return [];
  }
}

// Best-effort: nunca lanza, para no romper el PATCH que la registra.
export async function appendActivity(e: ActivityEntry): Promise<void> {
  if (usePostgres()) {
    try {
      const db = prisma();
      await db.activity.create({
        data: {
          ts: BigInt(e.ts),
          actor: e.actor,
          action: e.action,
          type: e.type,
          glpiId: e.id,
          locationId: e.location_id ?? null,
          userId: e.user_id ?? null,
        },
      });
      // Recorte a las últimas MAX_ENTRIES (igual que activity.json).
      await db.$executeRaw`DELETE FROM "activity_log" WHERE "id" NOT IN (SELECT "id" FROM "activity_log" ORDER BY "id" DESC LIMIT ${MAX_ENTRIES})`;
    } catch {}
    return;
  }
  try {
    const p = await activityPath();
    let arr: ActivityEntry[] = [];
    try {
      const j = JSON.parse(await fs.readFile(p, "utf8"));
      if (Array.isArray(j)) arr = j;
    } catch {}
    arr.push(e);
    if (arr.length > MAX_ENTRIES) arr = arr.slice(-MAX_ENTRIES);
    await fs.writeFile(p, JSON.stringify(arr), "utf8");
  } catch {}
}
