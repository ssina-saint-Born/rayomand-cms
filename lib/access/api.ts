import { getClientIp } from "./ip";
import { isBlocked } from "./firewall";
import { currentUser } from "../auth";

export interface AccessResponse {
    success: boolean;
    message: string | null;
    data: Record<string, any>;
}

export function accessOk(message: string | null = null, data: Record<string, any> = {}, extra: Record<string, any> = {}): Response {
    const body: AccessResponse & Record<string, any> = { success: true, message, data: { ...data, ...extra } };
    return Response.json(body, { status: 200 });
}

export function accessFail(message: string, data: Record<string, any> = {}, status = 400): Response {
    // message_key mirrors the core API error shape so the shared client helper
    // surfaces the Persian message instead of a generic status text.
    return Response.json({ success: false, message, message_key: message, data }, { status });
}

// Mirrors UserAPI::permission_callback(): requires a resolvable IP, rejects
// already-logged-in callers, and rejects blocked IPs. Returns an error Response
// when the request must be rejected, or null when allowed.
export async function guardAnonymous(req: Request): Promise<Response | null> {
    const ip = await getClientIp();
    if (ip === null)
        return accessFail("امکان شناسایی آدرس آی.پی شما وجود ندارد.");
    const u = await currentUser();
    if (u)
        return accessFail("شما وارد شده اید.");
    if (await isBlocked(ip))
        return accessFail("آدرس آی.پی شما مسدود شده است.");
    // CSRF: same-origin JSON POST. Require a custom header set by the client.
    if (req.method !== "GET") {
        const ct = req.headers.get("content-type") || "";
        if (!ct.includes("application/json") && !ct.includes("text/plain"))
            return accessFail("درخواست نامعتبر است. لطفاً صفحه را مجدداً بارگذاری کنید.");
    }
    return null;
}