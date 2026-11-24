import { Gateway } from "./sms-gateways";
import { HttpGateway, HttpSpec, Ctx, ok, localNumber, bareNumber } from "./sms-gateways-http";

// Providers answer a receipt id, an error code or a plain word; each entry
// mirrors the exact predicate the plugin used.
function codeAtLeast(min: number) {
    return (body: string) => {
        const value = Number(String(body).trim());
        return Number.isFinite(value) && Math.abs(value) >= min;
    };
}

// SignalAds appends the mandatory Iranian opt-out suffix.
export function ensureCancelSuffix(message: string): string {
    const trimmed = message.replace(/\s+$/, "");
    if (!trimmed)
        return trimmed;
    const ascii = trimmed
        .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
        .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
    if (/لغو\s*[0-9]{1,3}\s*$/.test(ascii))
        return trimmed;
    return `${trimmed} لغو ۱۱`;
}

export function httpGateways(): Gateway[] {
    const G = (id: string, name: string, spec: HttpSpec) => new HttpGateway(id, name, spec);
    const commas = (c: Ctx) => c.mobiles.join(",");
    const dashes = (c: Ctx) => c.mobiles.join("-");
    const okOrDone = ok.or(ok.text("ok"), ok.contains("done"));

    return [
        G("afe", "Afe.ir — واید", {
            url: () => "https://www.afe.ir/Url/SendSMS",
            perMobile: true,
            query: (c, to) => ({ username: c.username, Password: c.password, Number: c.sender, mobile: to, sms: c.message }),
            success: ok.contains("success"),
        }),
        G("aryana", "PayamKotah.com — پیام کوتاه", {
            url: () => "https://www.payamkotah.ir/FastSendSMS.ashx",
            query: (c) => ({ user: c.username, pass: c.password, mobile: dashes(c), line: c.sender, message: c.message, flash: 1 }),
            success: codeAtLeast(2000),
        }),
        G("asiasms", "AsiaSMS.ir — آسیا اس ام اس", {
            url: () => "https://api.asiasms.ir:8080/Messages/SendViaURL",
            query: (c) => ({ Username: c.username, password: c.password, Receivers: commas(c), SmsText: c.message, SenderId: c.sender }),
            success: ok.json((v) => v?.IsSuccessful === true),
        }),
        G("asanak", "Asanak.ir — آسانک", {
            url: () => "https://sms.asanak.ir/webservice/v2rest/sendsms",
            method: "POST",
            body: (c) => ({ username: c.username, password: c.password, source: c.sender, destination: c.mobiles.map(localNumber).join(","), message: c.message, send_to_blacklist: 0 }),
            success: ok.json((v) => v?.meta?.status === 200),
            pattern: {
                url: () => "https://sms.asanak.ir/webservice/v2rest/template",
                body: (c, to, pattern) => ({ username: c.username, password: c.password, template_id: pattern.code, parameters: pattern.vars, destination: localNumber(to), send_to_blacklist: 0 }),
                success: (body) => {
                    try {
                        return JSON.parse(body)?.meta?.status === 200;
                    }
                    catch {
                        return false;
                    }
                },
            },
        }),
        G("behsadade", "SMS.BehsaDade.com — بهسا داده", {
            url: () => "https://sms.behsadade.com/webservice/rest/sms_send",
            query: (c) => ({ login_username: c.username, login_password: c.password, receiver_number: commas(c), note_arr: c.message, sender_number: c.sender }),
            success: ok.json((v) => !v?.error && !!v?.result),
        }),
        G("persian-sms", "Persian-SMS.com — پرشین اس ام اس", {
            url: () => "https://persian-sms.com/api/",
            query: (c) => ({ username: c.username, password: c.password, text: c.message, to: commas(c), from: c.sender, action: "SMS_SEND", FLASH: 0, API_CHANGE_ALLOW: "true", api: 6 }),
            success: ok.json((v) => !v?.error && !!v?.result),
        }),
        G("gamasystems", "gama.systems", {
            url: () => "https://sms.gama.systems/url/post/SendSMS.ashx",
            query: (c) => ({ username: c.username, password: c.password, to: dashes(c), from: c.sender, text: c.message }),
            success: codeAtLeast(11),
        }),
        G("hafezpayam", "HafezPayam.com — حافظ پیام", {
            url: () => "https://hafezpayam.com/URLSend.aspx",
            perMobile: true,
            query: (c, to) => ({ Username: c.username, Password: c.password, PortalCode: c.sender, Mobile: to, Message: c.message, Flash: 0 }),
            success: codeAtLeast(30),
        }),
        G("iransms", "IranSMS.co — ایران اس ام اس", {
            url: () => "https://www.iransms.co/URLSend.aspx",
            perMobile: true,
            query: (c, to) => ({ Username: c.username, Password: c.password, PortalCode: c.sender, Mobile: to, Message: c.message, Flash: 0 }),
            success: codeAtLeast(30),
        }),
        G("negins", "Negins.com — نگین", {
            url: () => "https://negins.com/URLSend.aspx",
            perMobile: true,
            query: (c, to) => ({ Username: c.username, Password: c.password, PortalCode: c.sender, Mobile: to, Message: c.message, Flash: 0 }),
            success: codeAtLeast(30),
        }),
        G("irpayamak", "IrPayamak.com — آی آر پیامک", {
            url: () => "https://irpayamak.com/API/SendSms.ashx",
            query: (c) => ({ username: c.username, password: c.password, from: c.sender, to: c.mobiles.map(localNumber).join("-"), message: c.message.trim() }),
            success: ok.matches(/\[[\s\S]*\]/),
        }),
        G("isms", "ISMS.ir — آی اس ام اس", {
            url: () => "https://ws3584.isms.ir/sendWS",
            query: (c) => ({ username: c.username, password: c.password, mobiles: commas(c), body: c.message, sender: c.sender }),
            success: ok.json((v) => !(v?.code && v?.message)),
        }),
        G("nh1ir", "NH1.ir — نوین همراه", {
            url: () => "https://ws.nh1.ir/Api/SMS/Send",
            query: (c) => ({ Username: c.username, Password: c.password, To: commas(c), Text: c.message, From: c.sender }),
            success: ok.always,
        }),
        G("netpaydar", "SMS.NetPaydar.com — شبکه پایدار", {
            url: () => "https://sms.netpaydar.com/SendMessage.ashx",
            query: (c) => ({ user: c.username, pass: c.password, to: commas(c), lineNo: c.sender, text: c.message }),
            success: ok.or(ok.text("1"), ok.contains("ارسال با موفقیت انجام شد")),
        }),
        G("newsms", "NewSMS.ir — نیو اس ام اس", {
            url: () => "https://newsms.ir/api/",
            query: (c) => ({ action: "SMS_SEND", username: c.username, password: c.password, API_CHANGE_ALLOW: "true", to: commas(c), api: 1, from: c.sender, FLASH: 0, text: c.message }),
            success: ok.text("1"),
        }),
        G("npsms", "NPSMS.com — نوین پرداز", {
            url: () => "https://npsms.com/sendSmsViaURL.aspx",
            query: (c) => ({ userName: c.username, password: c.password, reciverNumber: dashes(c), senderNumber: c.sender, smsText: c.message, domainName: "npsms" }),
            success: codeAtLeast(1),
        }),
        G("pardissms", "Pardis.sSMSs.ir — پردیس اس ام اس", {
            url: () => "https://pardis.ssmss.ir/send_via_get/send_sms.php",
            query: (c) => ({ username: c.username, password: c.password, receiver_number: dashes(c), sender_number: c.sender, note: c.message }),
            success: codeAtLeast(8),
        }),
        G("samait", "SamaIT.ir — سما ارتباط اسپادانا", {
            url: () => "https://samait.ir/send_via_get/send_sms.php",
            query: (c) => ({ username: c.username, password: c.password, receiver_number: dashes(c), sender_number: c.sender, note: c.message }),
            success: codeAtLeast(8),
        }),
        G("ssmss", "sSMSs.ir — صلابت", {
            url: () => "https://ssmss.ir/send_via_get/send_sms.php",
            query: (c) => ({ username: c.username, password: c.password, receiver_number: dashes(c), sender_number: c.sender, note: c.message }),
            success: ok.always,
        }),
        G("parsiansms", "Parsian-SMS.ir — پارسیان اس ام اس", {
            url: () => "https://185.4.31.182/class/sms/webservice/send_url.php",
            query: (c) => ({ uname: c.username, pass: c.password, to: commas(c), from: c.sender, msg: c.message }),
            success: okOrDone,
        }),
        G("smsmelli", "SMSMelli.com — اس ام اس ملی", {
            url: () => "https://185.4.31.182/class/sms/webservice/send_url.php",
            query: (c) => ({ uname: c.username, pass: c.password, to: commas(c), from: c.sender, msg: c.message }),
            success: okOrDone,
        }),
        G("smsir", "SMS.ir (نام کاربری و کلمه عبور)", {
            url: () => "https://ip.sms.ir/SendMessage.ashx",
            query: (c) => ({ user: c.username, pass: c.password, to: commas(c), lineNo: c.sender, text: c.message }),
            success: ok.or(ok.text("ok"), ok.contains("ارسال با موفقیت انجام شد")),
        }),
        G("smsnegarir", "SMSNegar.ir — اس ام اس نگار", {
            url: () => "https://sms.smsnegar.ir/sendSMSURL.aspx",
            query: (c) => ({ username: c.username, password: c.password, domain: "sms.smsnegar", reciverNumber: dashes(c), senderNumber: c.sender, smsText: c.message }),
            success: codeAtLeast(8),
        }),
        G("sornasms", "SornaSMS.net — سورنا اس ام اس", {
            url: () => "https://sornasms.net/getCustomer.aspx",
            query: (c) => ({ username: c.username, pass: c.password, mobile: dashes(c), senderNumber: c.sender, message: c.message, code: 10260 }),
            success: codeAtLeast(1),
        }),
        G("sunwaysms", "SunWaySMS.com — راه آفتاب", {
            url: () => "https://sms.sunwaysms.com/SMSWS/HttpService.ashx",
            perMobile: true,
            query: (c, to) => ({ username: c.username, password: c.password, from: c.sender, to, message: c.message }),
            success: codeAtLeast(10000),
        }),
        G("trez", "SMSPanel.Trez.ir — ترز", {
            url: () => "https://smspanel.trez.ir/SendGroupMessageWithUrl.ashx",
            query: (c) => ({ Smsclass: 1, Username: c.username, Password: c.password, RecNumber: dashes(c), PhoneNumber: c.sender, MessageBody: c.message }),
            success: codeAtLeast(2000),
        }),
        G("raygansms", "RayganSMS.com — رایگان اس ام اس", {
            url: () => "https://smspanel.trez.ir/SendGroupMessageWithUrl.ashx",
            query: (c) => ({ Smsclass: 1, Username: c.username, Password: c.password, RecNumber: c.mobiles.map(localNumber).join("-"), PhoneNumber: c.sender, MessageBody: c.message }),
            success: codeAtLeast(2000),
        }),
        G("TSMS", "TSMS.ir — طوبی اس ام اس", {
            url: () => "https://tsms.ir/url/tsmshttp.php",
            query: (c) => ({ from: c.sender, to: commas(c), username: c.username, password: c.password, message: c.message }),
            success: (body) => body.trim().toLowerCase() > "20",
        }),
        G("websms", "WebSMS.ir — وب اس ام اس", {
            url: () => "https://s1.websms.ir/wservice.php",
            query: (c) => ({ cusername: c.username, cpassword: c.password, cmobileno: commas(c), csender: c.sender, cbody: c.message }),
            success: ok.longerThan(8),
        }),
        G("parsiantd", "sms.parsiantd.com", {
            url: () => "https://sms.parsiantd.com/Api-Services/sms_sender_url.php",
            perMobile: true,
            query: (c, to) => ({ username: c.username, password: c.password, from: c.sender, to, text: c.message }),
            success: codeAtLeast(12),
        }),
        G("payamresan", "payam-resan.com", {
            url: () => "https://www.payam-resan.com/APISend.aspx",
            query: (c) => ({ UserName: c.username, Password: c.password, To: commas(c), From: c.sender, Text: c.message }),
            success: ok.text("1"),
        }),
        G("sabanovin", "SabaNovin.com — صبا نوین", {
            url: (c) => `https://api.sabanovin.com/v1/${encodeURIComponent(c.username)}/sms/send.json`,
            auth: "user",
            query: (c) => ({ gateway: c.sender, to: commas(c), text: c.message }),
            success: ok.json((v) => v?.status?.code == 200),
        }),
        G("sahandsms", "SahandSMS.com — سهند اس ام اس", {
            url: () => "https://webservice.sahandsms.com/NewSMSWebService.asmx/SendFromUrl",
            query: (c) => ({ username: c.username, password: c.password, fromNumber: c.sender, toNumber: c.mobiles.map(localNumber).join("-"), message: c.message.trim() }),
            success: ok.always,
        }),
        G("karenkart", "karenkart.com", {
            url: () => "https://www.karenkart.com/Home/send_via_get",
            query: (c) => ({ note: c.message, username: c.username, password: c.password, receiver_number: commas(c), sender_number: c.sender }),
            success: codeAtLeast(1),
        }),
        G("_0098", "0098SMS.com — ۰۰۹۸ اس ام اس", {
            url: () => "https://www.0098sms.com/sendsmslink.aspx",
            perMobile: true,
            query: (c, to) => ({ DOMAIN: "0098", USERNAME: c.username, PASSWORD: c.password, FROM: c.sender, TO: to, TEXT: c.message }),
            success: ok.nonZero,
        }),

        G("araditc", "arad itc — آراد آی تی سی", {
            url: (c) => c.username,
            method: "POST",
            json: true,
            perMobile: true,
            auth: "none",
            headers: (c) => ({ Authorization: `Bearer 4|${c.password}`, Accept: "application/json" }),
            body: (c, to) => ({ SourceAddress: c.sender, MessageText: c.message, DestinationAddress: bareNumber(to) }),
            success: ok.json((v) => v?.message === "عملیات با موفقیت انجام شد"),
        }),
        G("jarin", "w.jarin.ir", {
            url: () => "https://wp.jarin.ir/Api/SendMessage.php",
            method: "POST",
            body: (c) => ({ phoneNumber: c.username, passWord: c.password, text: c.message, destPhoneNumbers: commas(c), lines: c.sender }),
            success: ok.json((v) => v?.status == 100),
        }),
        G("nicsms", "NikSMS.com — نیک اس ام اس", {
            url: () => "https://niksms.com/fa/PublicApi/GroupSms",
            method: "POST",
            body: (c) => ({ username: c.username, password: c.password, message: c.message, numbers: commas(c), senderNumber: c.sender, sendOn: new Date().toISOString().slice(0, 16).replace("T", "-"), sendType: 1 }),
            success: ok.json((v) => v?.Status === 1 || String(v?.Status).toLowerCase() === "successful"),
        }),
        G("sipka", "Sipka.co — سیپکا", {
            url: () => "https://sipka.co/api/json/sendgrouppost",
            method: "POST",
            auth: "none",
            body: (c) => {
                const [user, api] = String(c.username || "").split(";");
                return { username: (user || "").trim(), password: c.password, from: c.sender, api: (api || "").trim(), to: c.mobiles, text: c.mobiles.map(() => c.message) };
            },
            success: ok.json((v) => v?.success === true),
        }),
        G("wikipayam", "WikiPayam.ir — ویکی پیام", {
            url: () => "https://wikipayam.ir/api/v1/sms/send",
            method: "POST",
            json: true,
            auth: "user",
            headers: (c) => ({ Authorization: `Bearer ${String(c.username || c.password).trim()}` }),
            body: (c) => [{ sender: c.sender, receiver: c.mobiles.map(localNumber).join(","), message: c.message }],
            success: ok.json((v) => v !== null && typeof v === "object" && !(v as any)?.error),
        }),
        G("nmtsms", "NMTSMS.ir — نگین مرمر تجارت", {
            url: () => "https://nmtsms.ir/api/v1/SendBulk",
            method: "POST",
            json: true,
            auth: "user",
            body: (c) => ({ Token: String(c.username || c.password).trim(), Message: c.message, Mobiles: c.mobiles, SenderNumber: c.sender }),
            success: ok.json((v) => v?.Status == 0),
        }),
        G("webone", "WebOne-SMS.com — وب وان", {
            url: () => "https://rest.payamakapi.ir/api/v1/SMS/Send",
            method: "POST",
            json: true,
            perMobile: true,
            body: (c, to) => ({ UserName: c.username, Password: c.password, From: c.sender, Message: c.message, To: to }),
            success: ok.json((v) => v?.Status === true),
        }),
        G("mediana", "Mediana.ir — مدیانا", {
            url: () => "https://api.mediana.ir/sms/v1/send/sms",
            method: "POST",
            json: true,
            auth: "user",
            headers: (c) => ({ Authorization: String(c.username || "").startsWith("Bearer") ? c.username : `Bearer ${c.username || c.password}` }),
            body: (c) => ({ recipients: c.mobiles, messageText: c.message, sendingNumber: c.sender }),
            success: ok.json((v) => !!v?.data?.succeed),
            pattern: {
                url: () => "https://api.mediana.ir/sms/v1/send/pattern",
                headers: (c) => ({ Authorization: String(c.username || "").startsWith("Bearer") ? c.username : `Bearer ${c.username || c.password}` }),
                body: (c, _to, pattern) => ({ patternCode: pattern.code, recipients: c.mobiles, parameters: pattern.vars }),
                success: (body) => {
                    try {
                        return !!JSON.parse(body)?.data?.succeed;
                    }
                    catch {
                        return false;
                    }
                },
            },
        }),
        G("parsgreen", "ParsGreen.com — پارس گرین", {
            url: () => "https://sms.parsgreen.ir/Apiv2/Message/SendSms",
            method: "POST",
            json: true,
            auth: "user",
            headers: (c) => ({ Authorization: String(c.username || "").startsWith("basic apikey:") ? c.username : `basic apikey:${c.username || c.password}` }),
            body: (c) => ({ SmsBody: c.message, Mobiles: c.mobiles, SmsNumber: c.sender }),
            success: ok.json((v) => !!v?.R_Success),
        }),
        G("onesms", "onesms.ir — وان اس‌ام‌اس", {
            url: () => "https://connect.onesms.ir/v1/send/quick",
            method: "POST",
            json: true,
            auth: "user",
            headers: (c) => ({ "X-API-Key": String(c.username || c.password).trim() }),
            body: (c) => ({ body: c.message, from: c.sender, to: c.mobiles }),
            success: ok.json((v) => String(v?.code ?? "") === "0"),
            pattern: {
                url: () => "https://connect.onesms.ir/v1/send/pattern",
                headers: (c) => ({ "X-API-Key": String(c.username || c.password).trim() }),
                body: (c, _to, pattern) => ({ pattern: pattern.code, data: pattern.vars, from: c.sender, to: c.mobiles }),
                success: (body) => {
                    try {
                        return String(JSON.parse(body)?.code ?? "") === "0";
                    }
                    catch {
                        return false;
                    }
                },
            },
        }),
        G("panelchi", "PanelChi.com — پنل چی", {
            url: () => "https://api.panelchi.com/sms/send",
            method: "POST",
            json: true,
            auth: "user",
            headers: (c) => ({ Authorization: String(c.username || "").startsWith("Bearer") ? c.username : `Bearer ${c.username || c.password}` }),
            body: (c) => ({ sourceNumber: c.sender, recipients: c.mobiles, message: c.message }),
            success: ok.json((v) => !!v?.data?.uid),
            pattern: {
                url: () => "https://api.panelchi.com/sms/pattern",
                headers: (c) => ({ Authorization: String(c.username || "").startsWith("Bearer") ? c.username : `Bearer ${c.username || c.password}` }),
                body: (c, to, pattern) => ({ sourceNumber: c.sender, pattern: pattern.code, variables: pattern.vars, recipient: to }),
                success: (body) => {
                    try {
                        return !!JSON.parse(body)?.data?.uid;
                    }
                    catch {
                        return false;
                    }
                },
            },
        }),
        G("signalads", "Panel.SignalAds.com — سیگنال ادز", {
            url: () => "https://transmitor.signalads.com/api_v1/sms/send",
            method: "POST",
            json: true,
            auth: "user",
            headers: (c) => ({ Authorization: String(c.username || "").startsWith("Bearer") ? c.username : `Bearer ${c.username || c.password}` }),
            body: (c) => ({ from: c.sender, message: ensureCancelSuffix(c.message), numbers: c.mobiles }),
            success: ok.json((v) => v?.success === true),
            pattern: {
                url: () => "https://transmitor.signalads.com/api_v1/patterns/send",
                headers: (c) => ({ Authorization: String(c.username || "").startsWith("Bearer") ? c.username : `Bearer ${c.username || c.password}` }),
                body: (c, to, pattern) => ({ from: c.sender, pattern_id: Number(pattern.code) || 0, number: to, parameters: pattern.vars }),
                success: (body) => {
                    try {
                        return JSON.parse(body)?.success === true;
                    }
                    catch {
                        return false;
                    }
                },
            },
        }),
        G("payamresan-pattern", "payam-resan.com (پترن)", {
            url: () => "https://api.sms-webservice.com/api/V3/SendBulk",
            method: "POST",
            json: true,
            auth: "user",
            headers: (c) => ({ "X-API-KEY": String(c.username || c.password).trim() }),
            body: (c) => ({ ApiKey: String(c.username || c.password).trim(), Text: c.message, Sender: c.sender, Recipients: c.mobiles }),
            success: ok.json((v) => !!v?.Success),
            pattern: {
                url: () => "https://api.sms-webservice.com/api/V3/SendTokenSingle",
                headers: (c) => ({ "X-API-KEY": String(c.username || c.password).trim() }),
                body: (c, to, pattern) => ({ ApiKey: String(c.username || c.password).trim(), TemplateKey: pattern.code, ...pattern.vars, Destination: to }),
                success: (body) => {
                    try {
                        return JSON.parse(body)?.id !== undefined;
                    }
                    catch {
                        return false;
                    }
                },
            },
        }),
    ];
}
