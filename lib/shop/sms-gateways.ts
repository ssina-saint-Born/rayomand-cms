import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { splitMobiles, modifyMobile } from "./sms";

// Mirrors the plugin's Gateway base class: credentials come from settings,
// messages beginning with pattern:/pcode:/patterncode: are template calls.
export interface GatewaySendResult {
    ok: boolean;
    error?: string;
    failed?: Record<string, string>;
    raw?: any;
}

export class SmsError extends Error { }

export interface GatewayContext {
    username: string;
    password: string;
    sender: string;
    mobiles: string[];
    message: string;
    settings: Record<string, any>;
}

export abstract class Gateway {
    abstract id: string;
    abstract name: string;
    ctx!: GatewayContext;
    failedNumbers: Record<string, string> = {};

    token(): string {
        const u = String(this.ctx.username || "").trim();
        const p = String(this.ctx.password || "").trim();
        if (!u && !p)
            return "";
        return u || p;
    }

    isPattern(): boolean {
        const m = String(this.ctx.message || "");
        return m.startsWith("pattern:") || m.startsWith("pcode:") || m.startsWith("patterncode:");
    }

    // pattern:<code>\n<var>:<value>\n...
    parsePattern(): { code: string; vars: Record<string, string> } {
        const result: { code: string; vars: Record<string, string> } = { code: "", vars: {} };
        const normalised = String(this.ctx.message || "").replace(/\r\n|\n|\\r\\n|\\n/g, "~");
        for (const part of normalised.split("~")) {
            const idx = part.indexOf(":");
            if (idx < 0)
                continue;
            const key = part.slice(0, idx).replace(/[}{% \n\r\t\v\0]/g, "");
            const value = part.slice(idx + 1).trim();
            if (key === "pattern" || key === "pcode" || key === "patterncode")
                result.code = value;
            else if (key)
                result.vars[key] = value;
        }
        return result;
    }

    abstract send(): Promise<GatewaySendResult>;

    // format_failed_numbers(): collapse per-recipient failures into one message.
    formattedFailure(): GatewaySendResult {
        const groups: Record<string, string> = {};
        for (const [number, message] of Object.entries(this.failedNumbers)) {
            groups[message] = groups[message] ? `${number}, ${groups[message]}` : `${number}: ${message}`;
        }
        const error = Object.values(groups).join(" | ");
        return { ok: false, error, failed: { ...this.failedNumbers } };
    }
}

async function postJson(url: string, body: any, headers: Record<string, string> = {}): Promise<any> {
    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
        body: typeof body === "string" ? body : JSON.stringify(body),
        signal: AbortSignal.timeout(8000),
    });
    const text = await res.text();
    if (!text)
        return { __status: res.status };
    try {
        return { ...JSON.parse(text), __status: res.status };
    }
    catch {
        return { __status: res.status, __body: text };
    }
}

const logPath = () => path.join(process.cwd(), "data", "logs", "pwsms.log");

// The plugin's default gateway: never touches the network, masks numbers and
// appends the payload to wc-logs/pwsms.log. This is the "test gateway".
export class LoggerGateway extends Gateway {
    id = "logger";
    name = "pwsms.log — مخصوص وبمستران و توسعه دهندگان";
    async send(): Promise<GatewaySendResult> {
        const masked = this.ctx.mobiles.map((m) => `${m.slice(0, 4)}***${m.slice(-4)}`);
        const lines = ["", `######## ${new Date().toISOString()}`, `mobile: ${masked.join(", ")}`, `message: ${this.ctx.message}`, ""];
        await mkdir(path.dirname(logPath()), { recursive: true });
        await appendFile(logPath(), lines.join("\n"), "utf8");
        return { ok: true };
    }
}

export class MeliPayamakGateway extends Gateway {
    id: string;
    name: string;
    private base = "https://rest.payamak-panel.com/api/SendSMS";

    constructor(id = "melipayamak_unified", name = "melipayamak.com — ملی پیامک") {
        super();
        this.id = id;
        this.name = name;
    }

    // Codes unique to the unified REST endpoint (positive values).
    private static ERRORS: Record<string, string> = {
        "0": "Wrong username or password.",
        "2": "Insufficient credit.",
        "3": "Daily send limit reached.",
        "4": "Message count or size limit.",
        "5": "Invalid sender number.",
        "6": "Gateway is being updated.",
        "7": "Message text contains filtered words.",
        "8": "Fewer messages than the allowed minimum.",
        "9": "Sending from public lines is not allowed.",
        "10": "Message contains a link.",
        "11": "Recipient is on the blacklist.",
        "12": "Panel documents are incomplete.",
        "14": "Sending links from this line is not allowed.",
        "16": "Recipient not found.",
        "17": "Message text is empty.",
        "18": "Invalid recipient number.",
        "19": "Hourly limit exceeded.",
        "35": "Number is on the telecom blacklist.",
        "110": "Use an ApiKey instead of the password.",
        "109": "Configure allowed IPs for the API.",
        "108": "IP blocked after failed API attempts.",
    };

    async send(): Promise<GatewaySendResult> {
        if (!this.ctx.username || !this.ctx.password)
            throw new SmsError("Enter the MeliPayamak username and access key under the gateway settings.");
        const headers = { "Content-Type": "application/json; charset=utf-8" };
        const pattern = this.isPattern() ? this.parsePattern() : null;
        for (const to of this.ctx.mobiles) {
            try {
                const res = pattern
                    ? await postJson(`${this.base}/BaseServiceNumber`, { username: this.ctx.username, password: this.ctx.password, text: Object.values(pattern.vars).join(";"), bodyId: Number(pattern.code) || 0 }, headers)
                    : await postJson(`${this.base}/SendSMS`, { username: this.ctx.username, password: this.ctx.password, from: this.ctx.sender, text: this.ctx.message, to, isflash: false }, headers);
                const value = String(res?.Value ?? "");
                if (value.length > 15)
                    continue; // long Value is a receipt id → accepted
                if (res?.StrRetStatus && String(res.StrRetStatus) !== "OK") {
                    this.failedNumbers[to] = `Error: ${res.StrRetStatus}`;
                    continue;
                }
                if (value === "" || value === "0")
                    continue;
                this.failedNumbers[to] = MeliPayamakGateway.ERRORS[String(Math.abs(Number(value)))] || `Error ${value} while sending.`;
            }
            catch (e: any) {
                this.failedNumbers[to] = e.message;
            }
        }
        return Object.keys(this.failedNumbers).length ? this.formattedFailure() : { ok: true };
    }
}

export class KaveNegarGateway extends Gateway {
    id: string;
    name: string;

    constructor(id = "kavenegar", name = "KaveNegar.com — کاوه نگار") {
        super();
        this.id = id;
        this.name = name;
    }

    async send(): Promise<GatewaySendResult> {
        const key = this.token();
        if (!key)
            throw new SmsError("Define the web service key under the gateway settings.");
        if (this.isPattern()) {
            const pattern = this.parsePattern();
            let params = "";
            for (const [name, value] of Object.entries(pattern.vars)) {
                const clean = name === "token10" || name === "token20" ? value : value.replace(/[ \u200c]/g, "-");
                params += `&${name}=${encodeURIComponent(clean)}`;
            }
            for (const to of this.ctx.mobiles) {
                try {
                    const res = await postJson(`https://api.kavenegar.com/v1/${key}/verify/lookup.json?receptor=${encodeURIComponent(to)}&template=${encodeURIComponent(pattern.code)}${params}`, "");
                    if (Number(res?.return?.status) === 200)
                        continue;
                    this.failedNumbers[to] = res?.return?.message || "Unknown KaveNegar error.";
                }
                catch (e: any) {
                    this.failedNumbers[to] = e.message;
                }
            }
            return this.formattedFailure();
        }
        const qs = new URLSearchParams({ sender: this.ctx.sender, receptor: this.ctx.mobiles.join(","), message: this.ctx.message });
        const res = await postJson(`https://api.kavenegar.com/v1/${key}/sms/send.json?${qs}`, "");
        if (Number(res?.return?.status) === 200)
            return { ok: true, raw: res };
        throw new SmsError(res?.return?.message || "Unknown KaveNegar error.");
    }
}

export class SmsIrGateway extends Gateway {
    id: string;
    name: string;
    private base = "https://api.sms.ir/v1/";

    constructor(id = "smsir-new", name = "SMS.ir — کلید دسترسی") {
        super();
        this.id = id;
        this.name = name;
    }

    async send(): Promise<GatewaySendResult> {
        const key = this.token();
        if (!key)
            throw new SmsError("Define the web service key under the gateway settings.");
        const headers = { "X-API-KEY": key };
        if (this.isPattern()) {
            const pattern = this.parsePattern();
            for (const to of this.ctx.mobiles) {
                try {
                    const res = await postJson(`${this.base}send/verify`, {
                        mobile: to,
                        templateId: Number(pattern.code) || pattern.code,
                        parameters: Object.entries(pattern.vars).map(([name, value]) => ({ name, value })),
                    }, headers);
                    if (res?.data?.messageId)
                        continue;
                    this.failedNumbers[to] = res?.message || res?.title || "Unknown SMS.ir error.";
                }
                catch (e: any) {
                    this.failedNumbers[to] = e.message;
                }
            }
            return this.formattedFailure();
        }
        const res = await postJson(`${this.base}send/bulk`, { lineNumber: this.ctx.sender, messageText: this.ctx.message, mobiles: this.ctx.mobiles, sendDateTime: null }, headers);
        if (res?.data?.packId)
            return { ok: true, raw: res };
        throw new SmsError(res?.message || res?.title || "Unknown SMS.ir error.");
    }
}

export class IpPanelGateway extends Gateway {
    id: string;
    name: string;
    private base = "https://edge.ippanel.com/v1/api/send";

    constructor(id = "ippanel-token", name = "ippanel.com — کلید دسترسی") {
        super();
        this.id = id;
        this.name = name;
    }

    async send(): Promise<GatewaySendResult> {
        const key = this.token();
        if (!key)
            throw new SmsError("Define the web service key under the gateway settings.");
        if (!this.ctx.sender)
            throw new SmsError("Set the SMS sender number.");
        const headers = { Authorization: key };
        if (this.isPattern()) {
            const pattern = this.parsePattern();
            for (const to of this.ctx.mobiles) {
                try {
                    const res = await postJson(this.base, { sending_type: "pattern", from_number: this.ctx.sender, code: pattern.code, params: pattern.vars, recipients: [to] }, headers);
                    if (res?.meta?.status)
                        continue;
                    this.failedNumbers[to] = res?.meta?.message || "Unknown IPPanel error.";
                }
                catch (e: any) {
                    this.failedNumbers[to] = e.message;
                }
            }
            return this.formattedFailure();
        }
        const res = await postJson(this.base, { sending_type: "webservice", from_number: this.ctx.sender, message: this.ctx.message, params: { recipients: this.ctx.mobiles } }, headers);
        if (res?.meta?.status)
            return { ok: true, raw: res };
        throw new SmsError(res?.meta?.message || "Unknown IPPanel error.");
    }
}

export class GhasedakGateway extends Gateway {
    id: string;
    name: string;
    private base = "https://gateway.ghasedaksms.com/api/v1";

    constructor(id = "ghasedak", name = "Ghasedak.me — قاصدک") {
        super();
        this.id = id;
        this.name = name;
    }

    async send(): Promise<GatewaySendResult> {
        const key = this.token();
        if (!key)
            throw new SmsError("Define the web service key under the gateway settings.");
        const headers = { ApiKey: key, Accept: "application/json" };
        if (this.isPattern()) {
            const pattern = this.parsePattern();
            const res = await postJson(`${this.base}/Send/NewOTP`, { template: pattern.code, type: "1", receptor: this.ctx.mobiles.join(","), allparam: Object.entries(pattern.vars).map(([param, value]) => ({ param, value })) }, headers);
            if (res?.isSuccess)
                return { ok: true, raw: res };
            throw new SmsError(res?.message || `HTTP ${res?.__status}`);
        }
        const res = await postJson(`${this.base}/Send/Bulk`, { sendDate: new Date().toISOString(), Sender: this.ctx.sender, receptor: this.ctx.mobiles.join(","), message: this.ctx.message, checkId: String(Math.floor(Math.random() * 1000000)) }, headers);
        if (res?.isSuccess)
            return { ok: true, raw: res };
        throw new SmsError(res?.message || `HTTP ${res?.__status}`);
    }
}

export class FarazSmsGateway extends Gateway {
    id = "farazsms";
    name = "FarazSMS.com — فراز اس ام اس";
    private base = "https://api.iranpayamak.com";

    constructor(id = "farazsms", name = "FarazSMS.com — فراز اس ام اس") {
        super();
        this.id = id;
        this.name = name;
    }

    async send(): Promise<GatewaySendResult> {
        const key = this.token();
        if (!key)
            throw new SmsError("Define the web service key under the gateway settings.");
        if (!this.ctx.sender)
            throw new SmsError("Set the SMS sender number.");
        const headers = { "Api-Key": key, Accept: "application/json" };
        if (this.isPattern()) {
            const pattern = this.parsePattern();
            for (const to of this.ctx.mobiles) {
                const local = modifyMobile(to).replace(/^\+98/, "0");
                try {
                    const res = await postJson(`${this.base}/ws/v1/sms/pattern`, { code: pattern.code, attributes: pattern.vars, line_number: this.ctx.sender, from: this.ctx.sender, number_format: "english", recipient: local }, headers);
                    this.collect(res, to);
                }
                catch (e: any) {
                    this.failedNumbers[to] = e.message;
                }
            }
            return this.formattedFailure();
        }
        const res = await postJson(`${this.base}/ws/v1/sms/simple`, { text: this.ctx.message, recipients: this.ctx.mobiles, from: this.ctx.sender, line_number: this.ctx.sender, number_format: "english" }, headers);
        this.collect(res, "");
        return Object.keys(this.failedNumbers).length ? this.formattedFailure() : { ok: true, raw: res };
    }

    private collect(res: any, recipient: string) {
        const status = Number(res?.__status || 0);
        const ok = status === 200 || status === 201;
        if (ok && (!res?.status || res.status === "success"))
            return;
        const message = res?.messages ? (Array.isArray(res.messages) ? res.messages.join(", ") : String(res.messages)) : `HTTP ${status}`;
        if (recipient)
            this.failedNumbers[recipient] = message;
        else
            this.failedNumbers[""] = message;
    }
}

// Any provider not shipped with a dedicated driver can still be used; the
// request template supports {mobile} {message} {sender} {username} {password}
// and one request per recipient, which covers most Iranian HTTP APIs.
export class CustomGateway extends Gateway {
    id = "custom";
    name = "Custom HTTP gateway (request template)";

    async send(): Promise<GatewaySendResult> {
        const s = this.ctx.settings;
        const url = String(s.sms_gateway_custom_url || "").trim();
        if (!url)
            throw new SmsError("Set the custom gateway endpoint URL.");
        let headers: Record<string, string> = { "Content-Type": "application/json; charset=utf-8" };
        try {
            if (String(s.sms_gateway_custom_headers || "").trim())
                headers = { ...headers, ...JSON.parse(String(s.sms_gateway_custom_headers)) };
        }
        catch {
            throw new SmsError("Custom gateway headers must be a JSON object.");
        }
        const template = String(s.sms_gateway_custom_body || "");
        const method = String(s.sms_gateway_custom_method || "POST").toUpperCase();
        for (const to of this.ctx.mobiles) {
            const body = template
                .replace(/\{mobile\}/g, to)
                .replace(/\{message\}/g, this.ctx.message)
                .replace(/\{sender\}/g, this.ctx.sender)
                .replace(/\{username\}/g, this.ctx.username)
                .replace(/\{password\}/g, this.ctx.password);
            try {
                const res = await fetch(url, { method, headers, body: method === "GET" ? undefined : body, signal: AbortSignal.timeout(8000) });
                const text = await res.text();
                if (!res.ok) {
                    this.failedNumbers[to] = `HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`;
                }
            }
            catch (e: any) {
                this.failedNumbers[to] = e.message;
            }
        }
        return Object.keys(this.failedNumbers).length ? this.formattedFailure() : { ok: true };
    }
}
