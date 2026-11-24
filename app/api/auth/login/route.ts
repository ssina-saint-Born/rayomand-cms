import { authenticate, createSession, setSessionCookie } from "@/lib/auth";
import { ok, fail, readBody } from "@/lib/api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
    const body = await readBody(req);
    const { username, password } = body;
    if (!username || !password)
        return fail("Username and password are required");
    const user = (await authenticate(String(username), String(password)));
    if (!user)
        return fail("Invalid username or password", 401);
    const token = (await createSession(user.id));
    setSessionCookie(token);
    return ok({ user });
}
