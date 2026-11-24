import { Gateway, GatewaySendResult, GatewayContext, SmsError } from "./sms-gateways";

export type Ctx = GatewayContext;

export function qs(params: Record<string, any>): string {
    const out: string[] = [];
    for (const [k, v] of Object.entries(params)) {
        if (v === undefined || v === null)
            continue;
        if (Array.isArray(v)) {
            for (const item of v)
                out.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(item))}`);
            continue;
        }
        out.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
    }
    return out.join("&");
}

export function encodeForm(value: any, prefix?: string, out: string[] = []): string {
    if (value === null || value === undefined)
        return out.join("&");
    if (Array.isArray(value)) {
        value.forEach((v, i) => encodeForm(v, prefix ? `${prefix}[${i}]` : String(i), out));
        return out.join("&");
    }
    if (typeof value === "object") {
        for (const [k, v] of Object.entries(value))
            encodeForm(v, prefix ? `${prefix}[${k}]` : k, out);
        return out.join("&");
    }
    if (prefix)
        out.push(`${encodeURIComponent(prefix)}=${encodeURIComponent(String(value))}`);
    return out.join("&");
}

export function appendQuery(url: string, params: Record<string, any>): string {
    const query = qs(params);
    if (!query)
        return url;
    return `${url}${url.includes("?") ? "&" : "?"}${query}`;
}

export const localNumber = (mobile: string) => mobile.replace(/^\+98/, "0");
export const bareNumber = (mobile: string) => mobile.replace(/^(\+98|0)/, "");

export const ok = {
    always: () => true,
    text: (value: string) => (body: string) => body.trim().toLowerCase() === value,
    contains: (needle: string) => (body: string) => body.toLowerCase().includes(needle.toLowerCase()),
    atLeast: (n: number) => (body: string) => Math.abs(Number(String(body).replace(/[^0-9.-]/g, ""))) >= n,
    above: (n: number) => (body: string) => Number(String(body).trim()) > n,
    nonZero: (body: string) => Number(String(body).trim()) !== 0,
    longerThan: (n: number) => (body: string) => body.length > n,
    matches: (re: RegExp) => (body: string) => re.test(body),
    json: (test: (value: any) => boolean) => (body: string) => {
        try {
            return test(JSON.parse(body));
        }
        catch {
            return false;
        }
    },
    or: (...tests: ((body: string) => boolean)[]) => (body: string) => tests.some((t) => t(body)),
};

export interface PatternSpec {
    url: (c: Ctx, pattern: { code: string; vars: Record<string, string> }) => string;
    body: (c: Ctx, to: string, pattern: { code: string; vars: Record<string, string> }) => any;
    headers?: (c: Ctx) => Record<string, string>;
    success: (body: string, status: number) => boolean;
}

export interface HttpSpec {
    method?: "GET" | "POST";
    url: (c: Ctx) => string;
    query?: (c: Ctx, to: string) => Record<string, any>;
    body?: (c: Ctx, to: string) => any;
    headers?: (c: Ctx) => Record<string, string>;
    json?: boolean;
    perMobile?: boolean;
    auth?: "both" | "user" | "none";
    success: (body: string, status: number) => boolean;
    timeout?: number;
    pattern?: PatternSpec;
}

export function normalizedForPattern(mobile: string): string {
    return mobile.replace(/^\+98/, "0");
}

// One driver describes every URL/HTTP gateway in the plugin: credentials go to
// the query string or the body, and each provider differs only by its spec.
export class HttpGateway extends Gateway {
    id: string;
    name: string;
    declare ctx: Ctx;

    constructor(id: string, name: string, private spec: HttpSpec) {
        super();
        this.id = id;
        this.name = name;
    }

    async send(): Promise<GatewaySendResult> {
        const c = this.ctx;
        const auth = this.spec.auth ?? "both";
        if (auth === "both" && (!c.username || !c.password))
            throw new SmsError("Enter the web service username and password in the gateway settings.");
        if (auth === "user" && !c.username && !c.password)
            throw new SmsError("Enter the web service access key in the gateway settings.");

        const pattern = this.isPattern() ? this.parsePattern() : null;
        if (pattern && this.spec.pattern)
            return this.sendPattern(pattern);

        const targets = this.spec.perMobile ? c.mobiles : [""];
        for (const to of targets) {
            const url = appendQuery(this.spec.url(c), this.spec.query ? this.spec.query(c, to) : {});
            try {
                let body = "";
                let status = 200;
                if ((this.spec.method || "GET") === "GET") {
                    const res = await fetch(url, { method: "GET", signal: AbortSignal.timeout(this.spec.timeout || 9000) });
                    status = res.status;
                    body = await res.text();
                }
                else {
                    const payload = this.spec.body ? this.spec.body(c, to) : {};
                    const headers = this.spec.headers ? this.spec.headers(c) : {};
                    const res = await fetch(url, {
                        method: "POST",
                        headers: this.spec.json
                            ? { Accept: "application/json", ...headers }
                            : { "Content-Type": "application/x-www-form-urlencoded; charset=utf-8", ...headers },
                        body: this.spec.json ? JSON.stringify(payload) : encodeForm(payload),
                        signal: AbortSignal.timeout(this.spec.timeout || 9000),
                    });
                    status = res.status;
                    body = await res.text();
                }
                if (!this.spec.success(body, status))
                    this.failedNumbers[to] = body.trim().slice(0, 300) || `The gateway did not confirm delivery (HTTP ${status}).`;
            }
            catch (e: any) {
                this.failedNumbers[to] = e.message;
            }
        }
        return this.finish();
    }

    private async sendPattern(pattern: { code: string; vars: Record<string, string> }): Promise<GatewaySendResult> {
        const c = this.ctx;
        const spec = this.spec.pattern!;
        for (const to of c.mobiles) {
            try {
                const res = await fetch(spec.url(c, pattern), {
                    method: "POST",
                    headers: { Accept: "application/json", "Content-Type": "application/json", ...(spec.headers ? spec.headers(c) : {}) },
                    body: JSON.stringify(spec.body(c, to, pattern)),
                    signal: AbortSignal.timeout(this.spec.timeout || 9000),
                });
                const body = await res.text();
                if (!spec.success(body, res.status))
                    this.failedNumbers[to] = body.trim().slice(0, 300) || `The gateway did not accept the template (HTTP ${res.status}).`;
            }
            catch (e: any) {
                this.failedNumbers[to] = e.message;
            }
        }
        return this.finish();
    }

    private finish(): GatewaySendResult {
        const keys = Object.keys(this.failedNumbers);
        if (!keys.length)
            return { ok: true };
        if (keys.length === 1 && keys[0] === "")
            return { ok: false, error: this.failedNumbers[""] };
        return this.formattedFailure();
    }
}

export interface SoapSpec {
    wsdl: string;
    namespace?: string;
    operation: string;
    soapAction?: string;
    args: (c: Ctx, to: string) => Record<string, any>;
    resultTag?: string;
    success?: (value: string) => boolean;
    // Some providers answer with an object graph rather than one scalar:
    // read the whole envelope instead of the extracted text.
    raw?: (xml: string) => string | null;
    perMobile?: boolean;
    headers?: (c: Ctx) => Record<string, string>;
}

function escapeXml(value: any): string {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function soapNode(name: string, value: any): string {
    if (Array.isArray(value))
        return `<${name}>${value.map((v) => soapNode("string", v)).join("")}</${name}>`;
    if (value && typeof value === "object")
        return `<${name}>${Object.entries(value).map(([k, v]) => soapNode(k, v)).join("")}</${name}>`;
    return `<${name}>${escapeXml(value ?? "")}</${name}>`;
}

const TEMPURI = "http://tempuri.org/";

// SOAP 1.1 client. PHP's SoapClient sent these same argument shapes to the
// provider WSDL; we build the envelope ourselves and read the text result,
// which is a receipt id on success or a provider error code otherwise.
export class SoapGateway extends Gateway {
    id: string;
    name: string;
    declare ctx: Ctx;

    constructor(id: string, name: string, private spec: SoapSpec) {
        super();
        this.id = id;
        this.name = name;
    }

    async send(): Promise<GatewaySendResult> {
        const c = this.ctx;
        if (!c.username || !c.password)
            throw new SmsError("Enter the web service username and password in the gateway settings.");
        for (const to of this.spec.perMobile ? c.mobiles : [""]) {
            const result = await this.sendOne(c, to);
            if (result)
                this.failedNumbers[to || ""] = result;
        }
        if (!Object.keys(this.failedNumbers).length)
            return { ok: true };
        const keys = Object.keys(this.failedNumbers);
        if (keys.length === 1 && keys[0] === "")
            return { ok: false, error: this.failedNumbers[""] };
        return this.formattedFailure();
    }

    private async sendOne(c: Ctx, to: string): Promise<string | null> {
        const ns = this.spec.namespace || TEMPURI;
        const args = Object.entries(this.spec.args(c, to)).map(([k, v]) => soapNode(k, v)).join("");
        const envelope = `<?xml version="1.0" encoding="utf-8"?>` +
            `<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">` +
            `<soap:Body><${this.spec.operation} xmlns="${ns}">${args}</${this.spec.operation}></soap:Body></soap:Envelope>`;
        try {
            const res = await fetch(this.spec.wsdl, {
                method: "POST",
                headers: {
                    "Content-Type": "text/xml; charset=utf-8",
                    SOAPAction: this.spec.soapAction ?? `"${ns}${this.spec.operation}"`,
                    ...(this.spec.headers ? this.spec.headers(c) : {}),
                },
                body: envelope,
                signal: AbortSignal.timeout(12000),
            });
            const xml = await res.text();
            if (!res.ok)
                return `HTTP ${res.status} from the web service.`;
            if (this.spec.raw) {
                const verdict = this.spec.raw(xml);
                return verdict === null ? null : verdict || "The gateway did not confirm delivery.";
            }
            const result = this.readResult(xml);
            const success = this.spec.success || ((v: string) => Number(v) > 1000 || Number(v) === 1);
            return success(result) ? null : result || "The gateway did not confirm delivery.";
        }
        catch (e: any) {
            return e.message;
        }
    }

    private readResult(xml: string): string {
        if (this.spec.resultTag) {
            const m = xml.match(new RegExp(`<${this.spec.resultTag}>([\\s\\S]*?)</${this.spec.resultTag}>`));
            return this.plain(m ? m[1] : "");
        }
        const fault = xml.match(/<faultstring>([\s\S]*?)<\/faultstring>/i);
        if (fault)
            return this.plain(fault[1]);
        const m = xml.match(/<([A-Za-z0-9_]*[Rr]esult)>([\s\S]*?)<\/\1>/);
        if (m)
            return this.plain(m[2]);
        const body = xml.match(/<soap:Body[^>]*>([\s\S]*?)<\/soap:Body>/i) || xml.match(/<Body[^>]*>([\s\S]*?)<\/Body>/i);
        return this.plain(body ? body[1] : "");
    }

    private plain(fragment: string): string {
        return String(fragment).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    }
}

// msgway templates carry their payload inside the message:
// templateID:<id>|param1|param2
export class MsgWayGateway extends Gateway {
    id = "msgway";
    name = "MSGWay.com — راه پیام";
    declare ctx: Ctx;

    async send(): Promise<GatewaySendResult> {
        const key = this.ctx.username || this.ctx.password;
        if (!key)
            throw new SmsError("Enter the MSGWay API key in the gateway settings.");
        const match = this.ctx.message.match(/templateID:(\d+)/);
        if (!match)
            return { ok: false, error: "The message must contain templateID:<id>|param1|param2." };
        const params = this.ctx.message.replace(/templateID:\d+\|/, "").split("|").filter(Boolean);
        for (const to of this.ctx.mobiles) {
            const payload: Record<string, any> = { mobile: to, method: "sms", templateID: Number(match[1]), params };
            if (this.ctx.sender)
                payload.provider = Number(this.ctx.sender);
            try {
                const res = await fetch("https://api.msgway.com/send", {
                    method: "POST",
                    headers: { "Content-Type": "application/json", apiKey: key },
                    body: JSON.stringify(payload),
                    signal: AbortSignal.timeout(9000),
                });
                const data: any = await res.json().catch(() => null);
                if (data?.status === "success")
                    continue;
                this.failedNumbers[to] = data?.error?.message || `HTTP ${res.status}`;
            }
            catch (e: any) {
                this.failedNumbers[to] = e.message;
            }
        }
        return Object.keys(this.failedNumbers).length ? this.formattedFailure() : { ok: true };
    }
}

// Bale (بله) bot: username holds the access key, sender the bot id.
export class BaleGateway extends Gateway {
    id = "bale";
    name = "bale.ai — پیامرسان بله";
    declare ctx: Ctx;

    async send(): Promise<GatewaySendResult> {
        const token = this.ctx.username || this.ctx.password;
        const botId = String(this.ctx.sender || "").trim();
        if (!token || !botId)
            return { ok: false, error: "Set the Bale bot access key and the bot id (sender field)." };
        for (const to of this.ctx.mobiles) {
            const phone = to.startsWith("+98") ? to : to.startsWith("0") ? `+98${to.slice(1)}` : `+98${to}`;
            try {
                const res = await fetch("https://safir.bale.ai/api/v3/send_message", {
                    method: "POST",
                    headers: { "api-access-key": token, "Content-Type": "application/json" },
                    body: JSON.stringify({
                        request_id: crypto.randomUUID(),
                        bot_id: botId,
                        phone_number: phone,
                        message_data: { message: { text: this.ctx.message } },
                    }),
                    signal: AbortSignal.timeout(12000),
                });
                const data: any = await res.json().catch(() => null);
                if (data === "invalid_access_key")
                    return { ok: false, error: "The Bale access key is not valid." };
                if (data && data.error_data)
                    this.failedNumbers[to] = Object.keys(data.error_data)
                        .map((k) => `${data.error_data[k]?.code ?? k} => ${data.error_data[k]?.description ?? ""}`)
                        .join(", ");
                else if (!data)
                    this.failedNumbers[to] = "Invalid response from Bale.";
            }
            catch (e: any) {
                this.failedNumbers[to] = e.message;
            }
        }
        return Object.keys(this.failedNumbers).length ? this.formattedFailure() : { ok: true };
    }
}

// LogisticSMS exchanges username/password for a short-lived API token first.
export class LogisticSmsGateway extends Gateway {
    id = "logistic-sms";
    name = "LogisticSMS.ir — لجستیک پیامک";
    declare ctx: Ctx;
    private base = "https://api.logisticsms.ir";

    async send(): Promise<GatewaySendResult> {
        if (!this.ctx.username || !this.ctx.password)
            throw new SmsError("Enter the LogisticSMS username and password.");
        let token = "";
        try {
            const login = await fetch(`${this.base}/api/v1/login`, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams({ username: this.ctx.username, password: this.ctx.password }).toString(),
                signal: AbortSignal.timeout(10000),
            });
            const data: any = await login.json().catch(() => null);
            if (data?.msg !== "success" || !data?.data?.token)
                return { ok: false, error: data?.msg || "Could not obtain the LogisticSMS token." };
            token = data.data.token;
        }
        catch (e: any) {
            return { ok: false, error: e.message };
        }
        for (const to of this.ctx.mobiles) {
            try {
                const res = await fetch(`${this.base}/api/v1/sms/send`, {
                    method: "POST",
                    headers: { "X-API-TOKEN": token, "Content-Type": "application/x-www-form-urlencoded" },
                    body: new URLSearchParams({ receptor: to, message: this.ctx.message, sender: this.ctx.sender }).toString(),
                    signal: AbortSignal.timeout(9000),
                });
                const data: any = await res.json().catch(() => null);
                if (data?.msg !== "success")
                    this.failedNumbers[to] = data?.msg || `HTTP ${res.status}`;
            }
            catch (e: any) {
                this.failedNumbers[to] = e.message;
            }
        }
        return Object.keys(this.failedNumbers).length ? this.formattedFailure() : { ok: true };
    }
}
