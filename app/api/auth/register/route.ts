import { getSettings } from "@/lib/options";
import { getUserByUsername, createUser } from "@/lib/users";
import { hashPassword } from "@/lib/password";
import { createSession, setSessionCookie } from "@/lib/auth";
import { ok, fail, readBody } from "@/lib/api";
import { slugify } from "@/lib/format";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
    const settings = (await getSettings());
    if (!settings.users_can_register)
        return fail("Registration is disabled", 403);
    const body = await readBody(req);
    const username = slugify(String(body.username || "")).replace(/-/g, "");
    const email = String(body.email || "").trim();
    const password = String(body.password || "");
    if (!username || !email || !password)
        return fail("Username, email and password are required");
    if (password.length < 12)
        return fail("Password must be at least 12 characters");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("A valid email address is required");
    if ((await getUserByUsername(username)))
        return fail("Username already exists");
    const id = (await createUser({
        username,
        email,
        password_hash: hashPassword(password),
        display_name: username,
        role: settings.default_role === "customer" ? "customer" : "subscriber",
    }));
    const token = (await createSession(id));
    setSessionCookie(token);
    return ok({ id, username }, 201);
}
