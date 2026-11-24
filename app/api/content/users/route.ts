import { listUsers, createUser, getUserByUsername } from "@/lib/users";
import { hashPassword } from "@/lib/password";
import { ok, fail, readBody, auth } from "@/lib/api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
    const { res } = (await auth("administrator"));
    if (res)
        return res;
    return ok((await listUsers()));
}
export async function POST(req: Request) {
    const { res } = (await auth("administrator"));
    if (res)
        return res;
    const body = await readBody(req);
    const username = String(body.username || "").trim();
    const email = String(body.email || "").trim();
    const password = String(body.password || "");
    if (!username || !email || !password)
        return fail("Username, email and password are required");
    if ((await getUserByUsername(username)))
        return fail("Username already exists");
    const id = (await createUser({
        username,
        email,
        password_hash: hashPassword(password),
        display_name: body.display_name || username,
        role: body.role || "subscriber",
        bio: body.bio || "",
    }));
    return ok({ id }, 201);
}
