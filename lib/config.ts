import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";

export type AppConfig = {
  glpiBaseUrl: string;
  appToken: string;
  userTokenEnc: string; // user_token cifrado AES-GCM (equivale a password)
  keepUserOnMove: boolean;
  rootLocationId: number | null;
  appName: string;
  accentColor: string;
};

const CONFIG_KEY = process.env.CONFIG_KEY || "dev-key-cambia-esto-32-chars-minimo!";

export function dataDir(): string {
  return process.env.DATA_DIR || path.join(process.cwd(), "data");
}

async function configPath(): Promise<string> {
  const d = dataDir();
  try {
    await fs.mkdir(d, { recursive: true });
  } catch {}
  // Fallback a /app/data si DATA_DIR no es escribible (p.ej. imagen standalone)
  try {
    await fs.access(d, fs.constants.W_OK);
    return path.join(d, "config.json");
  } catch {
    const fb = "/app/data";
    await fs.mkdir(fb, { recursive: true });
    return path.join(fb, "config.json");
  }
}

function key32(): Buffer {
  return crypto.createHash("sha256").update(CONFIG_KEY).digest();
}

export function encryptSecret(plain: string): string {
  if (!plain) return "";
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key32(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `${iv.toString("hex")}:${c.getAuthTag().toString("hex")}:${enc.toString("hex")}`;
}

export function decryptSecret(payload: string): string {
  if (!payload || !payload.includes(":")) return payload || "";
  try {
    const [ivs, tags, data] = payload.split(":");
    const d = crypto.createDecipheriv("aes-256-gcm", key32(), Buffer.from(ivs, "hex"));
    d.setAuthTag(Buffer.from(tags, "hex"));
    return Buffer.concat([d.update(Buffer.from(data, "hex")), d.final()]).toString("utf8");
  } catch {
    return "";
  }
}

export async function loadConfig(): Promise<AppConfig> {
  const p = await configPath();
  try {
    const j = JSON.parse(await fs.readFile(p, "utf8"));
    return {
      glpiBaseUrl: (j.glpiBaseUrl || process.env.GLPI_BASE_URL || "http://192.168.170.125").replace(/\/$/, ""),
      appToken: j.appToken || "",
      userTokenEnc: j.userTokenEnc || "",
      keepUserOnMove: j.keepUserOnMove ?? true,
      rootLocationId: j.rootLocationId ?? null,
      appName: (j.appName || "GLPI Move").toString().slice(0, 40),
      accentColor: /^#[0-9a-fA-F]{6}$/.test(j.accentColor || "") ? j.accentColor : "#0b5ed7",
    };
  } catch {
    return {
      glpiBaseUrl: (process.env.GLPI_BASE_URL || "http://192.168.170.125").replace(/\/$/, ""),
      appToken: "",
      userTokenEnc: "",
      keepUserOnMove: true,
      rootLocationId: null,
      appName: "GLPI Move",
      accentColor: "#0b5ed7",
    };
  }
}

export async function saveConfig(c: AppConfig): Promise<void> {
  const p = await configPath();
  await fs.writeFile(p, JSON.stringify(c, null, 2), "utf8");
}

export function publicConfig(c: AppConfig) {
  return {
    glpiBaseUrl: c.glpiBaseUrl,
    appTokenSet: !!c.appToken,
    userTokenSet: !!c.userTokenEnc,
    keepUserOnMove: c.keepUserOnMove,
    rootLocationId: c.rootLocationId,
    appName: c.appName,
    accentColor: c.accentColor,
  };
}
