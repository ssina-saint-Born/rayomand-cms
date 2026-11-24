import fs from "node:fs/promises";
import path from "node:path";
import { getDb } from "@/lib/db";
import { mailReady } from "@/lib/mail";
import { auth, ok } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { res } = await auth("administrator");
  if (res) return res;
  const database = await getDb().one("SELECT current_database() AS name, version() AS version");
  let storage = false;
  try { await fs.access(path.join(process.cwd(), "public")); storage = true; } catch { }
  return ok({ database: { engine: "PostgreSQL", connected: true, ...database }, storage, smtp: (await mailReady()) ? "configured" : "not configured", redis: "not required" });
}
