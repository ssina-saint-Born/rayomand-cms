import { getAccessSection, setAccessSection } from "./settings";

// Gateway option key. setAccessSection prepends "access_", so this yields the
// final `access_gateway_<class>` option name.
export function optionKeyFor(cls: string): string {
    return `gateway_${cls.toLowerCase()}`;
}

export async function getGatewayOptions(cls: string): Promise<Record<string, any>> {
    return getAccessSection(optionKeyFor(cls));
}

export async function getGatewayOption(cls: string, key: string, fallback: any = null): Promise<any> {
    const o = await getGatewayOptions(cls);
    return o[key] !== undefined ? o[key] : fallback;
}

export async function setGatewayOption(cls: string, patch: Record<string, any>): Promise<void> {
    await setAccessSection(optionKeyFor(cls), patch);
}

// Shared pattern parser (the SMS gateways\BaseGateway::parse_pattern).
export function parsePattern(message: string): { code: string; vars: Record<string, string> } {
    const result: { code: string; vars: Record<string, string> } = { code: "", vars: {} };
    const normalized = String(message).replace(/\r\n|\n/g, "~");
    for (const part of normalized.split("~")) {
        const idx = part.indexOf(":");
        if (idx < 0)
            continue;
        const key = part.slice(0, idx).trim().replace(/[{}%\s]/g, "");
        const value = part.slice(idx + 1).trim();
        if (key === "pattern")
            result.code = value;
        else if (key)
            result.vars[key] = value;
    }
    return result;
}

export function isPatternMessage(message: string): boolean {
    return String(message || "").startsWith("pattern:");
}

// HTTP POST helper (the auth helpers\Curl::post) returning parsed JSON.
export async function curlPost(url: string, data?: string | null, headers: string[] = []): Promise<any> {
    const finalHeaders = headers.length ? headers : ["Accept: application/json"];
    const res = await fetch(url, {
        method: "POST",
        headers: { ...(data ? { "Content-Type": "application/json" } : {}), ...headerList(finalHeaders) },
        body: data ?? undefined,
        signal: AbortSignal.timeout(8000),
    });
    const text = await res.text();
    if (!text)
        throw new Error(`کد ${res.status}: پاسخی از ${url} دریافت نشد.`);
    try {
        return JSON.parse(text);
    }
    catch {
        throw new Error(`کد ${res.status}: پاسخ دریافت شده معتبر نمی‌باشد.`);
    }
}

function headerList(headers: string[]): Record<string, string> {
    const out: Record<string, string> = {};
    for (const h of headers) {
        const idx = h.indexOf(":");
        if (idx > 0)
            out[h.slice(0, idx).trim()] = h.slice(idx + 1).trim();
    }
    return out;
}