import { getAccessOption } from "./settings";
import { getGatewayOption, isPatternMessage, parsePattern, curlPost } from "./gateways";
import { Mobile } from "./mobile";
import { deliverEmail } from "../mail";
import { getDb } from "../db";

export interface SendResult {
    sent: string[];
    updated: Record<string, boolean>;
}

// Replace {{otp}} / {{code}} with the numeric code (the access layer SMSService::replace_code).
export function replaceCode(message: string, code: number): string {
    return String(message).replace(/\{\{\s*(otp|code)\s*\}\}/gi, String(code));
}

// --- SMS via the configured sentinel gateway ---
export async function sendTestSms(mobile: string, code: number): Promise<boolean> {
    const gateway = String(await getAccessOption("sms.gateway", "none"));
    if (gateway === "none" || !gateway)
        throw new Error("درگاه پیامکی پیکربندی نشده است.");
    return sendViaGateway(gateway, mobile, String(code));
}

async function sendSmsCode(mobile: string, code: number): Promise<boolean> {
    let message = String(await getAccessOption("sms.message_code", ""));
    if (!message)
        message = String(code);
    message = replaceCode(message, code);

    const gateway = String(await getAccessOption("sms.gateway", "none"));
    if (gateway === "none" || !gateway)
        throw new Error("درگاه پیامکی پیکربندی نشده است.");

    return sendViaGateway(gateway, mobile, message);
}

async function sendViaGateway(gateway: string, mobile: string, message: string): Promise<boolean> {
    const G = gateway.toLowerCase();
    if (G === "logger" || G === "test" || G === "log") {
        console.log("[sentinel:sms]", mobile, message);
        return true;
    }

    if (G === "kavenegar") {
        const apiKey = await getGatewayOption("kavenegar", "api_key", "");
        if (!apiKey)
            throw new Error("API Key را در بخش تنظیمات وبسرویس تعریف کنید.");
        if (isPatternMessage(message)) {
            const p = parsePattern(message);
            let qs = "";
            for (const [k, v] of Object.entries(p.vars))
                qs += `&${k}=${encodeURIComponent(v)}`;
            const url = `https://api.kavenegar.com/v1/${apiKey}/verify/lookup.json?receptor=${encodeURIComponent(mobile)}&template=${encodeURIComponent(p.code)}${qs}`;
            const r = await curlPost(url);
            const status = r?.return?.status || 0;
            if (status === 200)
                return true;
            throw new Error(r?.return?.message || "خطای ناشناخته در ارسال به کاوه‌نگار رخ داده است.");
        }
        else {
            const sender = await getGatewayOption("kavenegar", "sender", "");
            const qs = new URLSearchParams({ sender, receptor: mobile, message });
            const r = await curlPost(`https://api.kavenegar.com/v1/${apiKey}/sms/send.json?${qs.toString()}`);
            const status = r?.return?.status || 0;
            if (status === 200)
                return true;
            throw new Error(r?.return?.message || "خطای ناشناخته در ارسال به کاوه‌نگار رخ داده است.");
        }
    }

    if (G === "maxsms") {
        const apiKey = await getGatewayOption("maxsms", "api_key", "");
        const sender = await getGatewayOption("maxsms", "sender", "");
        let payload: any;
        if (isPatternMessage(message)) {
            const p = parsePattern(message);
            payload = { sending_type: "pattern", from_number: sender, recipients: [mobile], code: p.code, params: p.vars };
        }
        else {
            payload = { sending_type: "webservice", from_number: sender, message, params: { recipients: [mobile] } };
        }
        const r = await curlPost("https://edge.ippanel.com/v1/api/send", JSON.stringify(payload), [
            "Content-Type: application/json",
            "Authorization: " + apiKey,
        ]);
        if (r?.meta?.status)
            return true;
        throw new Error(r?.meta?.message || "خطای ناشناخته در ارسال به مکس اس ام اس رخ داده است.");
    }

    if (G === "melipayamak") {
        const username = await getGatewayOption("melipayamak", "username", "");
        const password = await getGatewayOption("melipayamak", "password", "");
        const sender = await getGatewayOption("melipayamak", "sender", "");
        let url: string;
        let payload: any;
        if (/^\d+$/.test(message)) {
            url = "https://rest.payamak-panel.com/api/SendSMS/SendOtp";
            payload = { username, password, from: sender, to: mobile, code: message };
        }
        else if (isPatternMessage(message)) {
            url = "https://rest.payamak-panel.com/api/SendSMS/BaseServiceNumber";
            const p = parsePattern(message);
            payload = { username, password, to: mobile, text: Object.values(p.vars).join(";"), bodyId: Number(p.code) };
        }
        else {
            url = "https://rest.payamak-panel.com/api/SendSMS/SendSMS";
            payload = { username, password, from: sender, to: mobile, text: message, isflash: false };
        }
        const r = await curlPost(url, JSON.stringify(payload), ["Content-Type: application/json; charset=utf-8"]);
        const value = String(r?.Value ?? "");
        if (value.length > 15)
            return true;
        if (value)
            throw new Error(`خطای ${value} در ارسال پیامک رخ داده است.`);
        throw new Error("خطای ناشناخته در ارسال به ملی پیامک رخ داده است.");
    }

    if (G === "iranpayamak") {
        const apiKey = await getGatewayOption("iranpayamak", "api_key", "");
        const sender = await getGatewayOption("iranpayamak", "sender", "");
        if (!apiKey)
            throw new Error("کلید وبسرویس را در بخش تنظیمات وبسرویس تعریف کنید.");
        if (!sender)
            throw new Error("شماره فرستنده پیامک تعیین نشده است.");
        let m = mobile.replace(/^\+98/, "");
        if (!m.startsWith("0"))
            m = "0" + m;
        let url: string;
        let payload: any;
        if (isPatternMessage(message)) {
            const p = parsePattern(message);
            url = "https://api.iranpayamak.com/ws/v1/sms/pattern";
            payload = { code: p.code, attributes: p.vars, line_number: sender, from: sender, recipient: m, number_format: "english", numberFormat: "english" };
        }
        else {
            url = "https://api.iranpayamak.com/ws/v1/sms/simple";
            payload = { text: message, recipients: [m], from: sender, line_number: sender, number_format: "english" };
        }
        const r = await curlPost(url, JSON.stringify(payload), ["Content-Type: application/json", "Accept: application/json", "Api-Key: " + apiKey]);
        if (r?.status === "success")
            return true;
        if (r?.messages)
            throw new Error(Array.isArray(r.messages) ? r.messages.join(", ") : r.messages);
        throw new Error("خطای ناشناخته در ارسال به فراز اس ام اس رخ داده است.");
    }

    if (G === "panelchi") {
        const apiKey = await getGatewayOption("panelchi", "api_key", "");
        const sourceNumber = await getGatewayOption("panelchi", "source_number", "10001");
        let url: string;
        let payload: any;
        if (isPatternMessage(message)) {
            const p = parsePattern(message);
            url = "https://api.panelchi.com/sms/pattern";
            payload = { sourceNumber, recipient: mobile, pattern: p.code, variables: p.vars };
        }
        else {
            url = "https://api.panelchi.com/sms/send";
            payload = { sourceNumber, recipients: [mobile], message };
        }
        const r = await curlPost(url, JSON.stringify(payload), ["Content-Type: application/json", "Authorization: Bearer " + apiKey]);
        if (r?.data?.uid)
            return true;
        if (r?.detail)
            throw new Error(r.detail);
        if (r?.title)
            throw new Error(r.title);
        throw new Error("خطای ناشناخته در ارسال به پنل‌چی رخ داده است.");
    }

    if (G === "pwsms") {
        // Reuse the Commerce SMS gateway registry, message with patterncode:.
        const { sendSms } = await import("../shop/sms-gateways-registry");
        const smsMessage = message.replace("pattern:", "patterncode:");
        const res = await sendSms({ mobile, message: smsMessage, type: 1 });
        if (res === true)
            return true;
        throw new Error(typeof res === "string" ? res : "خطا در ارسال پیامک");
    }

    throw new Error(`درگاه پیامکی «${gateway}» یافت نشد.`);
}

// --- Email ---
async function sendEmailCode(email: string, code: number): Promise<boolean> {
    const logo = String(await getAccessOption("design.logo", ""));
    const siteName = String(await getSiteName());
    const content = [
        `<!DOCTYPE html><html dir="rtl"><body style="font-family:Vazirmatn,sans-serif">`,
        `<div style="max-width:520px;margin:auto;padding:20px">`,
        logo ? `<div style="text-align:center"><img src="${logo}" alt="" height="56"/></div>` : "",
        `<h2 style="text-align:center">${siteName} - کد تایید</h2>`,
        `<p>کد تایید شما:</p>`,
        `<div style="font-size:28px;font-weight:bold;text-align:center;letter-spacing:4px" dir="ltr">${code}</div>`,
        `<p style="color:#888">این کد تا ${Math.round(180 / 60)} دقیقه معتبر است. آن را با دیگران به اشتراک نگذارید.</p>`,
        `</div></body></html>`,
    ].join("");
    await deliverEmail(email, `${siteName} - کد تایید`, siteName, content, "access_otp");
    return true;
}

// --- Call (Zohal) ---
async function sendCallCode(mobile: string, code: number): Promise<boolean> {
    const apiKey = String(await getAccessOption("zohal.api_key", ""));
    if (!apiKey)
        throw new Error("تماس صوتی فعال نیست. توکن زحل را تنظیم کنید.");
    const data = { mobile: new Mobile(mobile).withZero(), code };
    const r = await curlPost("https://service.zohal.io/api/v0/services/inquiry/voice_otp", JSON.stringify(data), [
        "Content-Type: application/json",
        "Authorization: Bearer " + apiKey,
        "zohal-reseller-id: sentinel",
    ]);
    if (r?.result === 1)
        return true;
    throw new Error(r?.response_body?.message || "خطا در ارسال تماس صوتی");
}

// --- Bale messenger ---
async function sendBaleCode(mobile: string, code: number): Promise<boolean> {
    const token = String(await getAccessOption("messengers.bale_api_token", ""));
    const botId = String(await getAccessOption("messengers.bale_bot_id", ""));
    if (!token || !botId)
        throw new Error("پیام‌رسان بله فعال نیست.");
    const data = {
        bot_id: Number(botId),
        phone_number: mobile,
        message_data: { otp_message: { otp: String(code) } },
    };
    const r = await curlPost("https://safir.bale.ai/api/v3/send_message", JSON.stringify(data), [
        "api-access-key: " + token,
        "Content-Type: application/json",
    ]);
    if (r?.message_id)
        return true;
    if (r?.error_data?.[0]?.description)
        throw new Error(r.error_data[0].description);
    throw new Error("خطای ناشناخته در ارسال کد تایید به بله رخ داده است.");
}

export async function baleEnabled(): Promise<boolean> {
    const token = String(await getAccessOption("messengers.bale_api_token", ""));
    const botId = String(await getAccessOption("messengers.bale_bot_id", ""));
    return !!(token && botId);
}

// Resolve the channels available for an identifier, mirroring
// ChannelService::get_channels(): bale first when configured, then voice call
// as an SMS fallback once a recent OTP already went out by SMS.
export async function getChannels(identifierValue: string, isMobile: boolean): Promise<string[]> {
    if (!isMobile)
        return ["email"];
    const channels: string[] = [];
    if (await baleEnabled())
        channels.push("bale");

    const last = await getDb().one(
        "SELECT channels FROM access_otp WHERE identifier=$1 AND expires_at >= $2 ORDER BY id DESC LIMIT 1",
        identifierValue, new Date(Date.now() - 14 * 60000).toISOString(),
    );
    let hadSms = false;
    try {
        const parsed = last ? JSON.parse(last.channels || "{}") : {};
        hadSms = Object.prototype.hasOwnProperty.call(parsed, "sms");
    }
    catch {
        hadSms = false;
    }
    channels.push(hadSms && (await callEnabled()) ? "call" : "sms");
    return channels;
}

export async function callEnabled(): Promise<boolean> {
    const apiKey = String(await getAccessOption("zohal.api_key", ""));
    return !!apiKey;
}

async function getSiteName(): Promise<string> {
    const r = await import("../options");
    const s = await r.getSettings();
    return s.site_title || "سایت";
}

// Dispatches the code through the requested channels.
export async function sendOtp(_otpId: number, identifierValue: string, code: number, channels: Record<string, boolean>): Promise<SendResult> {
    const isMobile = /^\+98/.test(identifierValue);
    const isEmail = /@/.test(identifierValue);
    const results: Record<string, boolean> = {};
    for (const channel of Object.keys(channels)) {
        try {
            if (channel === "sms") {
                if (!isMobile)
                    throw new Error("پیامک صرفا به تلفن همراه ارسال می‌شود.");
                results.sms = await sendSmsCode(identifierValue, code);
            }
            else if (channel === "email") {
                if (!isEmail)
                    throw new Error("ایمیل صرفا به آدرس ایمیل ارسال می‌شود.");
                results.email = await sendEmailCode(identifierValue, code);
            }
            else if (channel === "call") {
                if (!isMobile)
                    throw new Error("پیام صوتی صرفا به تلفن همراه ارسال می‌شود.");
                results.call = await sendCallCode(identifierValue, code);
            }
            else if (channel === "bale") {
                if (!isMobile)
                    throw new Error("پیام بله صرفا به تلفن همراه ارسال می‌شود.");
                results.bale = await sendBaleCode(identifierValue, code);
            }
        }
        catch (e) {
            // log and keep the channel as failed
            console.error("[sentinel:channel]", channel, (e as Error).message);
        }
    }
    const sent = Object.keys(results).filter((c) => results[c]);
    if (!sent.length)
        throw new Error("خطایی در زمان ارسال کد تایید رخ داده است.");
    return { sent, updated: results };
}