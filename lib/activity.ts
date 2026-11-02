import { promises as fs } from "fs";
import path from "path";
import { dataDir } from "./config";

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
