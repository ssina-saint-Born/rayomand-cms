import { createHash, timingSafeEqual } from "node:crypto";
import { getDb, withTransaction } from "@/lib/db";
import { countUsers, createUser } from "@/lib/users";
import { hashPassword } from "@/lib/password";
import { createSession, setSessionCookie } from "@/lib/auth";
import { setOption } from "@/lib/options";
import { ok, fail, readBody } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() { return ok({ required: await countUsers() === 0 }); }

export async function POST(req: Request) {
  if (req.headers.get("origin") && req.headers.get("origin") !== new URL(req.url).origin) return fail("Invalid origin", 403);
  const body = await readBody(req);
  const secret = process.env.SETUP_TOKEN;
  const hash = (s: string) => createHash("sha256").update(s).digest();
  if (!secret || typeof body.setup_token !== "string" || !timingSafeEqual(hash(secret), hash(body.setup_token))) return fail("Invalid setup token. Read SETUP_TOKEN from your private .env file.", 403);
  const username = String(body.username || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  if (!/^[a-zA-Z0-9_.-]{3,64}$/.test(username)) return fail("Username must contain 3–64 letters, numbers, dots, dashes or underscores.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("A valid email is required.");
  if (password.length < 12) return fail("Use a password with at least 12 characters.");
  const password_hash = hashPassword(password);
  try {
    const result = await withTransaction(async () => {
      await getDb().one("SELECT pg_advisory_xact_lock(7845232)");
      if (await countUsers() !== 0) throw new Error("This workspace is already configured.");
      const id = await createUser({ username, email, password_hash, display_name: username, role: "administrator" });
      await setOption("site_title", String(body.site_title || "Rayomand CMS").trim());
      await setOption("admin_email", email);
      return { id, token: await createSession(id) };
    });
    setSessionCookie(result.token);
    return ok({ id: result.id, username }, 201);
  } catch (error: any) { return fail(error.message, 409); }
}
