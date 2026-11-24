import { fail, ok, readBody, auth } from "@/lib/api";
import { issueApiToken, listApiTokens, revokeApiToken } from "@/lib/api-tokens";
import { listDevices } from "@/lib/devices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Admin view of API tokens and mobile devices. Issuing a token here is how a
// scripted client (or a CI job) gets access without a browser session.
export async function GET(req: Request) {
    const { user, res } = await auth("administrator");
    if (res)
        return res;
    const url = new URL(req.url);
    const userId = Number(url.searchParams.get("user_id") || 0) || undefined;
    return ok({ tokens: await listApiTokens(userId), devices: await listDevices(userId) });
}

export async function POST(req: Request) {
    const { user, res } = await auth("administrator");
    if (res)
        return res;
    const body = await readBody(req);
    const targetUserId = Number(body.user_id || user!.id);
    const ttlDays = body.ttl_days ? Math.min(Math.max(Number(body.ttl_days), 1), 3650) : undefined;
    const issued = await issueApiToken({
        userId: targetUserId,
        name: String(body.name || "API token"),
        kind: String(body.kind || "script"),
        scopes: Array.isArray(body.scopes) ? body.scopes.map(String) : ["content"],
        ttlDays,
    });
    // The raw token is returned exactly once; only its hash is stored.
    return ok({ id: issued.id, token: issued.token, note: "Copy this token now — it will not be shown again." }, 201);
}

export async function DELETE(req: Request) {
    const { res } = await auth("administrator");
    if (res)
        return res;
    const id = Number(new URL(req.url).searchParams.get("id") || 0);
    if (!id)
        return fail("Missing token id.");
    return ok({ revoked: await revokeApiToken(id) });
}
