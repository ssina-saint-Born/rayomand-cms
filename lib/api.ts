import { currentUser, hasRole } from "./auth";
import type { Role, User } from "./types";
import { getTranslator } from "./i18n-server";
export function ok(data: any, status = 200): Response {
    return Response.json(data, { status });
}
export function fail(message: string, status = 400): Response {
    return Response.json({ error: getTranslator()(message), message_key: message, code: status }, { status });
}
export async function readBody(req: Request): Promise<any> {
    try {
        return await req.json();
    }
    catch {
        return {};
    }
}
export async function auth(min: Role = "subscriber"): Promise<{
    user?: User;
    res?: Response;
}> {
    const u = (await currentUser());
    if (!u)
        return { res: fail("Unauthorized", 401) };
    if (!hasRole(u, min))
        return { res: fail("Forbidden", 403) };
    return { user: u };
}
export function num(v: string | null): number | undefined {
    if (v === null || v === "")
        return undefined;
    const n = parseInt(v, 10);
    return isNaN(n) ? undefined : n;
}
