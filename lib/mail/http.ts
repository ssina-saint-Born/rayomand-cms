import { fail, ok } from "../api";
import { auth } from "../api";

// Helpers shared by the mail API routes. Admin-only by construction: mailbox
// administration must never be reachable by lower roles.

export async function requireAdmin(): Promise<Response | null> {
    const { res } = await auth("administrator");
    return res || null;
}

export function mailOk(data: unknown, message?: string): Response {
    return ok(message ? { ok: true, message, ...(data ? { data } : {}) } : { ok: true, data });
}

export function mailFail(message: string, status = 400): Response {
    return fail(message, status);
}

export function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
