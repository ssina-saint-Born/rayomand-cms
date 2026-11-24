import { createHash, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getDb, withTransaction } from "@/lib/db";
import { countUsers, createUser } from "@/lib/users";
import { hashPassword } from "@/lib/password";
import { createSession, setSessionCookie } from "@/lib/auth";
import { setOption } from "@/lib/options";
import { ok, fail, readBody } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// `build` lets an operator confirm which image is actually live; a fix that
// "didn't work" is usually a stale container still serving the old bundle.
function buildId(): string {
  try {
    return readFileSync(join(process.cwd(), ".next", "BUILD_ID"), "utf8").trim();
  } catch {
    return "unknown";
  }
}

export async function GET() { return ok({ required: await countUsers() === 0, build: buildId(), guard: GUARD_VERSION }); }

// CSRF guard for the bootstrap call.
//
// Only hostnames are compared, because TLS terminates at the proxy: Next.js
// sees the internal `http://…:3131` request while the browser sends
// `Origin: https://cms.example.com`.
//
// The rule is "enforce the check whenever the request actually carries the
// site's public hostname". Traefik normally supplies it in `X-Forwarded-Host`;
// Coolify also injects it as `COOLIFY_FQDN` / `SERVICE_URL_*`. If any of those
// yields a public DNS name, `Origin` must match it and a cross-site post is
// rejected — that is the case that matters, since an attacker's page always
// reaches us through the same proxy and therefore always carries those headers.
//
// When the proxy strips them all and only an internal address remains, an
// origin comparison cannot tell a real browser from a forged post: both would
// arrive with the same internal `Host` and nothing else. Rejecting there does
// not add protection, it only locks the operator out of a fresh install. That
// case falls back to SETUP_TOKEN, which the endpoint requires and which
// browsers never attach on their own.
const ENV_HOST_KEYS = /^(PUBLIC_ORIGIN|APP_URL|SITE_URL|COOLIFY_URL|COOLIFY_FQDN|SERVICE_FQDN_\w+|SERVICE_URL_\w+)$/;

// Bump when this logic changes; GET reports it, and serve.ts logs it at
// startup, so a stale container (the usual cause of "the fix didn't work") is
// obvious instead of indistinguishable from an unfixed bug.
const GUARD_VERSION = 3;

function hostOf(value: string): string {
  const text = value.trim();
  if (!text)
    return "";
  try {
    return new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `http://${text}`).hostname.toLowerCase();
  } catch {
    return "";
  }
}

// A public hostname, as opposed to the container address a proxy rewrites Host
// to: a dotted DNS name that is not loopback and not an IP literal.
function isPublicHost(host: string): boolean {
  if (!host || !host.includes("."))
    return false;
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal"))
    return false;
  return !/^\d{1,3}(\.\d{1,3}){3}$/.test(host) && !host.includes(":");
}

function publicHosts(req: Request): string[] {
  const values = [
    (req.headers.get("x-forwarded-host") || "").split(",")[0],
    req.headers.get("x-forwarded-server") || "",
    req.headers.get("host") || "",
    new URL(req.url).host,
  ];
  for (const [key, value] of Object.entries(process.env))
    if (value && ENV_HOST_KEYS.test(key))
      values.push(...value.split(","));
  const hosts = values.map(hostOf).filter(isPublicHost);
  return [...new Set(hosts)];
}

function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin)
    return true;
  const originHost = hostOf(origin);
  if (!originHost)
    return false;
  const known = publicHosts(req);
  if (!known.length) {
    console.warn(`[setup] no public host in the request (host="${req.headers.get("host") || "-"}"); origin "${originHost}" left to SETUP_TOKEN`);
    return true;
  }
  if (known.includes(originHost))
    return true;
  console.warn(`[setup] origin rejected: origin="${originHost}" public=${JSON.stringify(known)} host="${req.headers.get("host") || "-"}"`);
  return false;
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return fail("Invalid origin", 403);
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
