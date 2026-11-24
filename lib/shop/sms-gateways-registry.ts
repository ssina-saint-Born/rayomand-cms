import { Gateway } from "./sms-gateways";
import { LoggerGateway, MeliPayamakGateway, KaveNegarGateway, SmsIrGateway, IpPanelGateway, GhasedakGateway, FarazSmsGateway } from "./sms-gateways";
import { BaleGateway, LogisticSmsGateway, MsgWayGateway, SoapGateway } from "./sms-gateways-http";
import { httpGateways } from "./sms-gateways-http-registry";
import { soapGateways } from "./sms-gateways-soap-registry";
import { splitMobiles, getSmsSettings } from "./sms";
import { insertSmsArchive } from "./sms-tags";

// Every provider shipped with the plugin is registered here: SOAP and URL
// gateways come from their declarative tables, the API clients reuse the
// parameterised drivers so inherited ids (maxsms, panelsms20, …) behave
// exactly like their parents.
export function buildGateways(): Gateway[] {
    const list: Gateway[] = [
        new LoggerGateway(),
        ...soapGateways(),
        ...httpGateways(),

        new MsgWayGateway(),
        new BaleGateway(),
        new LogisticSmsGateway(),

        new MeliPayamakGateway("melipayamak_unified", "melipayamak.com — ملی پیامک"),
        new MeliPayamakGateway("melipayamakpattern", "melipayamak.com — ملی پیامک خدماتی"),
        new KaveNegarGateway("kavenegar", "KaveNegar.com — کاوه نگار"),
        new KaveNegarGateway("kavenegar_lookUp", "KaveNegar.com — کاوه نگار Lookup"),
        new SmsIrGateway("smsir-new", "SMS.ir (کلید دسترسی)"),
        new IpPanelGateway("ippanel-token", "ippanel.com (کلید دسترسی)"),
        new IpPanelGateway("maxsms", "MaxSMS.co — مکس اس ام اس"),
        new IpPanelGateway("modirpayamak", "ModirPayamak.com — مدیر پیامک"),
        new GhasedakGateway("ghasedak", "Ghasedak.me — قاصدک"),
        new FarazSmsGateway("farazsms", "FarazSMS.com — فراز اس ام اس"),

        // PanelSMS20 inherits RKASMS in the plugin.
        new SoapGateway("panelsms20", "PanelSMSPayam.ir — اس ام اس پیام", {
            wsdl: "https://rkasms.ir/services/SMSServices.asmx?WSDL",
            operation: "Send",
            perMobile: true,
            args: (c, to) => ({ userName: c.username, password: c.password, msg: c.message, from: c.sender, to, isFlashSend: false }),
            success: (v) => Number(v) === 1,
        }),
    ];
    return list;
}

let cache: Gateway[] | null = null;

export function allGateways(): Gateway[] {
    if (!cache)
        cache = buildGateways();
    return cache;
}

export function gatewayById(id: string): Gateway | undefined {
    return allGateways().find((g) => g.id === id);
}

// Sorted id → label, used by the settings dropdown.
export function gatewayOptions(): { id: string; name: string }[] {
    return allGateways()
        .map((g) => ({ id: g.id, name: g.name }))
        .sort((a, b) => a.name.localeCompare(b.name, "fa"));
}

export interface SendSmsInput {
    mobile: string | string[];
    message: string;
    type?: number;
    post_id?: number;
    post_type?: string;
    // Gateway override; defaults to the configured one.
    gateway?: string;
    gateway_username?: string;
    gateway_password?: string;
    gateway_sender?: string;
    settings?: Record<string, any>;
}

// send_sms(): validate recipients, hand the payload to the configured gateway,
// and archive the outcome. Returns true on success, an error string otherwise.
export async function sendSms(data: SendSmsInput): Promise<true | string> {
    const settings = data.settings || (await getSmsSettings());
    const message = String(data.message ?? "");
    const mobiles = splitMobiles(data.mobile ?? "");

    if (!mobiles.length)
        return "The mobile number is empty or invalid.";
    if (!message.trim())
        return "The SMS text is empty.";

    const gatewayId = data.gateway || String(settings.sms_gateway || "logger");
    const gateway = gatewayById(gatewayId);
    if (!gateway)
        return `SMS gateway "${gatewayId}" was not found.`;

    gateway.ctx = {
        username: data.gateway_username ?? String(settings.sms_gateway_username ?? ""),
        password: data.gateway_password ?? String(settings.sms_gateway_password ?? ""),
        sender: data.gateway_sender ?? String(settings.sms_gateway_sender ?? ""),
        mobiles,
        message,
        settings,
    };
    gateway.failedNumbers = {};

    let result: any;
    try {
        const out = await gateway.send();
        result = out.ok ? true : (out.error || "Unknown gateway error.");
    }
    catch (e: any) {
        result = e?.message || String(e);
    }

    if (typeof result !== "boolean" && typeof result !== "string")
        result = JSON.stringify(result);

    const senderDetails = `${gateway.name} ( ${gateway.ctx.sender || "unspecified"} )`;
    await insertSmsArchive({
        post_id: Number(data.post_id || 0),
        post_type: String(data.post_type || ""),
        type: Number(data.type || 0),
        reciever: mobiles.join(","),
        message,
        sender: senderDetails,
        result: result === true ? "_ok_" : result,
    });

    return result;
}
