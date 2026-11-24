import { ok, fail, readBody } from "@/lib/api";
import { authenticate, currentUser } from "@/lib/auth";
import { issueApiToken } from "@/lib/api-tokens";
import { registerDevice } from "@/lib/devices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Mobile sign-in. The app posts credentials once and receives a long-lived
// bearer token (not a cookie), which every other /api/mobile endpoint accepts.
// A device id is optional; when present the install is registered so the
// operator can see active devices and the app can be revoked per device.
export async function POST(req: Request) {
    const body = await readBody(req);
    const username = String(body.username || body.email || "").trim();
    const password = String(body.password || "");
    const deviceId = String(body.device_id || "").trim();
    if (!username || !password)
        return fail("Enter your username and password.", 400);

    const user = await authenticate(username, password);
    if (!user)
        return fail("Invalid username or password.", 401);

    const ttlDays = Math.min(Math.max(Number(body.ttl_days || 90), 1), 365);
    const issued = await issueApiToken({
        userId: user.id,
        name: deviceId ? `Mobile (${deviceId.slice(0, 12)})` : "Mobile app",
        kind: "mobile",
        scopes: ["content", "notifications"],
        ttlDays,
    });
    if (deviceId)
        await registerDevice({ userId: user.id, deviceId, platform: String(body.platform || "android"), label: String(body.device_label || ""), appVersion: String(body.app_version || "") });

    return ok({
        token: issued.token,
        token_id: issued.id,
        expires_in_days: ttlDays,
        user: { id: user.id, username: user.username, email: user.email, display_name: user.display_name, role: user.role },
    });
}

// Confirm the current bearer token still works (used on app launch).
export async function GET() {
    const user = await currentUser();
    if (!user)
        return fail("Unauthorized", 401);
    return ok({ user: { id: user.id, username: user.username, display_name: user.display_name, role: user.role } });
}
