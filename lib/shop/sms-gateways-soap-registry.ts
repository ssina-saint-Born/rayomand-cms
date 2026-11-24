import { Gateway } from "./sms-gateways";
import { SoapGateway, SoapSpec, Ctx, ok } from "./sms-gateways-http";

function bare(mobile: string): string {
    return mobile.replace(/^(\+98|0098|098|98|0)/, "");
}

const fiftyEight = (mobile: string) => `98${bare(mobile)}`;
const plusNinetyEight = (mobile: string) => `+98${bare(mobile)}`;
const zeroForm = (mobile: string) => `0${bare(mobile)}`;

function xmlAll(xml: string, tag: string): string[] {
    const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "gi");
    return Array.from(xml.matchAll(re), (m) => m[1]);
}

const stripTags = (value: string) => value.replace(/<[^>]+>/g, "").trim();

// post/send.asmx style payload used by ~25 providers:
// <SendSms><username/><password/><from/><to><string/></to><text/>
// <isflash/><udh/><recId/><status/></SendSms>
function sendSmsArgs(c: Ctx, flashKey: "isflash" | "flash" | null, recId: boolean): Record<string, any> {
    const args: Record<string, any> = {
        username: c.username,
        password: c.password,
        from: c.sender,
        to: c.mobiles,
        text: c.message,
    };
    if (flashKey)
        args[flashKey] = false;
    args.udh = "";
    if (recId) {
        args.recId = [0];
        args.status = 0;
    }
    return args;
}

export function soapGateways(): Gateway[] {
    const S = (id: string, name: string, spec: SoapSpec) => new SoapGateway(id, name, spec);
    const out: Gateway[] = [];

    const standard: [string, string, string][] = [
        ["aradsms", "Arad-SMS.ir — آراد اس ام اس", "https://arad-sms.ir/post/send.asmx?wsdl"],
        ["atlaspayamak", "AtlasPayamak.ir — اطلس پیامک", "https://4646.ir/post/send.php?wsdl"],
        ["chaparpanel", "ChaparPanel.ir — چاپار", "https://87.107.121.52/post/send.asmx?wsdl"],
        ["farapayamak", "FaraPayamak.ir — فراپیامک", "https://api.payamak-panel.com/post/send.asmx?wsdl"],
        ["farstech", "SMS.FarsTech.ir — فارس تک", "https://sms.farstech.ir/post/send.asmx?wsdl"],
        ["flashsms", "flashsms.ir (adminpayamak.ir)", "https://flashsms.ir/smssendwebserviceforcms.asmx?wsdl"],
        ["gamapayamak", "GAMAPayamak.com — گاما پیامک", "https://37.228.138.118/post/send.asmx?wsdl"],
        ["hadafwp", "SMS.HadafWP.com — هدف وردپرس", "https://sms.hadafwp.com/Post/Send.asmx?wsdl"],
        ["hostiran", "HostIran.com — هاست ایران", "https://37.228.138.118/post/send.asmx?wsdl"],
        ["iransmscom", "IranSMS.com — ایران اس ام اس", "https://87.107.52.205/post/send.asmx?wsdl"],
        ["iransmsserver", "iransmsserver.com", "https://sms.iransmsserver.ir/post/send.asmx?wsdl"],
        ["kianartpanel", "kianartpanel.ir", "https://onlinepanel.ir/post/send.asmx?wsdl"],
        ["loginpanel", "LoginPanel.ir — ایلام اس ام اس", "https://87.107.121.52/post/send.asmx?wsdl"],
        ["mehrpanel", "mehrpanel.ir", "https://87.107.121.52/post/send.asmx?wsdl"],
        ["niazpardaz", "SMS.NiazPardaz.com — نیاز پرداز", "https://37.228.138.118/post/send.asmx?wsdl"],
        ["paaz", "Paaz.ir — پاز", "https://sms.paaz.ir/post/send.asmx?wsdl"],
        ["parandsms", "ParandSMS.ir — پرند اس ام اس", "https://87.107.121.52/post/send.asmx?wsdl"],
        ["payamafraz", "payamafraz.com", "https://payamafraz.ir/post/send.asmx?wsdl"],
        ["payamakyab", "PayamakYab.com — پیامک یاب", "https://p.1000sms.ir/Post/Send.asmx?wsdl"],
        ["razpayamak", "RazPayamak.com — راز پیامک", "https://37.228.138.118/post/send.asmx?wsdl"],
        ["relax", "Relax.ir — ریلکس", "https://onlinepanel.ir/post/send.asmx?wsdl"],
        ["smsbefrest", "SmsBefrest.ir", "https://87.107.121.52/post/send.asmx?wsdl"],
        ["smsmeli", "SMS-Meli.com — سامانه پیامک ملی", "https://37.228.138.118/post/send.asmx?wsdl"],
        ["sefidsms", "sefidsms.ir", "https://api.sefidsms.ir/post/send.asmx?wsdl"],
        ["yektasms", "YektaTech.ir — یکتا تک", "https://37.228.138.118/post/send.asmx?wsdl"],
    ];
    for (const [id, name, wsdl] of standard) {
        out.push(S(id, name, {
            wsdl,
            operation: "SendSms",
            args: (c) => sendSmsArgs(c, "isflash", true),
            resultTag: "SendSmsResult",
            success: (v) => Number(v) === 1,
        }));
    }

    // Same shape but the flash flag is named `flash` and the receipt id varies.
    const flashOnly: [string, string, string, boolean, (v: string) => boolean][] = [
        ["azaranpayamak", "AzaranPayamak.ir — آذران پیامک", "https://azaranpayamak.ir/API/Send.asmx?WSDL", false, (v) => v === "0"],
        ["manirani", "ManIrani.ir — من ایرانی", "https://sms.manirani.ir/API/Send.asmx?WSDL", false, (v) => Number(v) > 0],
        ["postgah", "postgah.info", "https://postgah.net/API/Send.asmx?WSDL", false, (v) => v === "0"],
        ["smsfa", "SMSFa.ir", "https://smsfa.net/API/Send.asmx?WSDL", false, (v) => v === "0"],
        ["parsianpayam", "parsianpayam.ir", "https://onepayam.ir/API/Send.asmx?wsdl", true, (v) => Number(v) === 0],
    ];
    for (const [id, name, wsdl, recId, success] of flashOnly) {
        out.push(S(id, name, {
            wsdl,
            operation: "SendSms",
            args: (c) => sendSmsArgs(c, "flash", recId),
            resultTag: "SendSmsResult",
            success,
        }));
    }

    // user_name / fromNumber / toNumbers / messageContent spelling.
    for (const [id, name, wsdl] of [
        ["niazpardaz_", "Login.NiazPardaz.ir — نیاز پرداز", "https://payamak-service.ir/SendService.svc?wsdl"],
        ["satsms", "SatSMS.ir — سات اس ام اس", "https://payamakapi.ir/SendService.svc?wsdl"],
    ] as [string, string, string][]) {
        out.push(S(id, name, {
            wsdl,
            operation: "SendSms",
            args: (c) => ({
                userName: c.username,
                password: c.password,
                fromNumber: c.sender,
                toNumbers: c.mobiles,
                messageContent: c.message,
                isflash: false,
                udh: "",
                recId: [0],
                status: 0,
            }),
            resultTag: "SendSMSResult",
            success: (v) => v === "0",
        }));
    }

    out.push(S("aradpayamak", "AradPayamak.net — آراد پیامک", {
        wsdl: "https://aradpayamak.net/APPs/SMS/WebService.php?wsdl",
        operation: "sendSMS",
        args: (c) => ({ domain: "aradpayamak.net", username: c.username, password: c.password, from: c.sender, to: c.mobiles.join(";"), text: c.message, isflash: 0 }),
        success: (v) => v.length > 0,
    }));

    out.push(S("b1ir", "1b1.ir — یک به یک", {
        wsdl: "https://1b1.ir/APPs/SMS/WebService.php?wsdl",
        operation: "sendSMS",
        args: (c) => ({ domain: "1b1.ir", username: c.username, password: c.password, from: c.sender, to: c.mobiles.join(";"), text: c.message, isflash: 0 }),
        success: (v) => v.length > 0,
    }));

    // enqueue(): the provider reports state=done / errnum=100 inside an object.
    for (const [id, name, wsdl] of [
        ["avalpayam", "AvalPayam.com — اول پیام", "https://www.avalpayam.com/class/sms/webservice/server.php?wsdl"],
        ["smshooshmand", "SMSHooshmand.com — اس ام اس هوشمند", "https://smswbs.ir/class/sms/webservice/server.php?wsdl"],
    ] as [string, string, string][]) {
        out.push(S(id, name, {
            wsdl,
            operation: "enqueue",
            headers: (c) => ({ Authorization: `Basic ${Buffer.from(`${c.username}:${c.password}`).toString("base64")}` }),
            args: (c) => ({ from: c.sender, rcpt_array: c.mobiles.map(plusNinetyEight), msg: c.message, type: "normal" }),
            success: () => false,
            raw: (xml) => {
                const state = stripTags(xmlAll(xml, "state")[0] || "");
                const errnum = stripTags(xmlAll(xml, "errnum")[0] || "");
                if (state === "done" && errnum === "100")
                    return null;
                const message = stripTags(xmlAll(xml, "message")[0] || "");
                return message || `state=${state || "?"} errnum=${errnum || "?"}`;
            },
        }));
    }

    // Positional argument list: (4, from, username, password, '98', message, to, false)
    out.push(S("bakhtarpanel", "Bakhtar.xyz — باختر پنل", {
        wsdl: "https://login.bakhtar.xyz/webservice/server.asmx?wsdl",
        operation: "Sendsms",
        args: (c) => ({ __positional: [4, c.sender, c.username, c.password, "98", c.message, c.mobiles.join(","), false] }),
        success: () => false,
        raw: (xml) => {
            const text = stripTags(xml);
            const first = String(text.split(",")[0] || "").trim();
            return first === "1" ? null : text || "The gateway did not confirm delivery.";
        },
    }));

    out.push(S("berandet", "Berandet.ir — برندت", {
        wsdl: "https://berandet.ir/Modules/DevelopmentTools/Groups/Messaging/MessagingWbs.php?wsdl",
        operation: "sendMessageOneToMany",
        args: (c) => ({ request: { username: c.username, password: c.password, fromNumber: c.sender, message: c.message, recieptor: c.mobiles.map(plusNinetyEight) } }),
        success: () => false,
        raw: (xml) => {
            const code = stripTags(xmlAll(xml, "errCode")[0] || "");
            const err = stripTags(xmlAll(xml, "err")[0] || "");
            if (err)
                return err;
            if (code && Number(code) < 0)
                return `errCode ${code}`;
            return null;
        },
    }));

    // Send() returns one <result> object per recipient: Mobile + ID (ID starts
    // with "e" when that recipient failed).
    const sendResults: [string, string, string, Record<string, any>][] = [
        ["candoo", "CandooSMS.com — کندو اس ام اس", "https://my.candoosms.com/services/?wsdl", {}],
        ["payamsms", "PayamSMS.com — پیام اس ام اس", "https://new.payamsms.com/services/v2/?wsdl", { organization: "sazmansht" }],
        ["smspishgaman", "Panel.SmsPishgaman.com", "https://82.99.216.45/services/?wsdl", {}],
    ];
    for (const [id, name, wsdl, extra] of sendResults) {
        out.push(S(id, name, {
            wsdl,
            operation: "Send",
            args: (c) => ({ ...extra, username: c.username, password: c.password, srcNumber: c.sender, body: c.message, destNo: c.mobiles.map(fiftyEight), flash: "0" }),
            success: () => false,
            raw: (xml) => {
                const bodies = xmlAll(xml, "Body");
                const inner = bodies.length ? bodies[0] : xml;
                const failed: string[] = [];
                for (const item of inner.split(/<(?:result|SendResult)>/i).slice(1)) {
                    const mobile = stripTags((item.match(/<Mobile>([\s\S]*?)<\/Mobile>/i) || [])[1] || "");
                    const receipt = stripTags((item.match(/<ID>([\s\S]*?)<\/ID>/i) || [])[1] || "");
                    if (!mobile || /e/i.test(receipt))
                        failed.push(mobile || stripTags(item).slice(0, 80));
                }
                return failed.length ? `Not sent to: ${failed.join(", ")}` : null;
            },
        }));
    }

    out.push(S("chapargah", "Chapargah.com — چاپارگاه", {
        wsdl: "https://chapargah.com/API/Send.asmx?WSDL",
        operation: "SendSms",
        args: (c) => ({ username: c.username, password: c.password, from: c.sender, to: c.mobiles, text: c.message, flash: false, recId: [0], status: 0 }),
        resultTag: "SendSmsResult",
        success: (v) => v === "0",
    }));

    out.push(S("firstpayamak", "FirstPayamak.ir — اولین پیامک", {
        wsdl: "https://ui.firstpayamak.ir/webservice/v2.asmx?WSDL",
        operation: "SendSMS",
        args: (c) => ({ username: c.username, password: c.password, recipientNumbers: c.mobiles, senderNumbers: [c.sender], messageBodies: [c.message] }),
        success: () => false,
        raw: (xml) => {
            const ids = xmlAll(xml, "long").map((v) => Number(stripTags(v)));
            return ids.some((n) => n > 1000) ? null : "The gateway returned no delivery id.";
        },
    }));

    // SendSMS(from, to, text, '0', username, password) → array, first id > 100.
    for (const [id, name, wsdl] of [
        ["hiro_sms", "Hiro-SMS.com — هیرو اس ام اس", "https://my.hiro-sms.com/wbs/send.php?wsdl"],
        ["idehpayam", "IdehPayam.com — ایده پیام", "https://185.112.33.61/webservice/send.php?wsdl"],
    ] as [string, string, string][]) {
        out.push(S(id, name, {
            wsdl,
            operation: "SendSMS",
            args: (c) => ({ from: c.sender, to: c.mobiles, text: c.message, flash: "0", username: c.username, password: c.password }),
            success: () => false,
            raw: (xml) => {
                const first = Number(stripTags(xmlAll(xml, "string")[0] || "0"));
                return first > 100 ? null : "The gateway returned no delivery id.";
            },
        }));
    }

    out.push(S("mehrafraz", "MehrAfraz.com — مهر افراز آسیا", {
        wsdl: "https://www.mehrafraz.com/webservice/service.asmx?wsdl",
        operation: "SendSms",
        args: (c) => ({
            cUserName: c.username,
            cPassword: c.password,
            cDomainname: c.sender,
            cBody: c.message,
            cSmsnumber: c.mobiles.join(","),
            cGetid: "0",
            nCMessage: "1",
            nTypeSent: "1",
            m_SchedulDate: "",
            nSpeedsms: "0",
            nPeriodmin: "0",
            cstarttime: "",
            cEndTime: "",
        }),
        success: () => false,
        raw: (xml) => {
            const ids = xmlAll(xml, "string").map((v) => Number(stripTags(v))).filter((n) => Number.isFinite(n) && n !== 0);
            if (!ids.length)
                return "The gateway returned no delivery id.";
            const bad = ids.filter((n) => n < 1000);
            return bad.length ? `Error ${bad[0]}` : null;
        },
    }));

    out.push(S("rkasms", "آرکا اس ام اس — RKASMS.ir", {
        wsdl: "https://rkasms.ir/services/SMSServices.asmx?WSDL",
        operation: "Send",
        perMobile: true,
        args: (c, to) => ({ userName: c.username, password: c.password, msg: c.message, from: c.sender, to, isFlashSend: false }),
        success: (v) => Number(v) === 1,
    }));

    out.push(S("smsnegar", "SMS.SMSNegar.com — اس ام اس نگار", {
        wsdl: "https://sms.smsnegar.com/webservice/Service.asmx?wsdl",
        operation: "SendSms",
        args: (c) => ({
            cUserName: c.username,
            cPassword: c.password,
            cBody: c.message,
            cSmsnumber: c.mobiles.map(bare).join(""),
            cGetid: "0",
            nCMessage: "1",
            nTypeSent: "1",
            m_SchedulDate: "",
            cDomainname: "yazd",
            nSpeedsms: "0",
            nPeriodmin: "0",
            cstarttime: "",
            cEndTime: "",
        }),
        success: () => false,
        raw: (xml) => (stripTags(xmlAll(xml, "SendSmsResult")[0] || "").length ? null : "The gateway did not confirm delivery."),
    }));

    out.push(S("smsfor", "SMSFor.ir — ارتباط آفرینان تات", {
        wsdl: "https://www.smsfor.ir/webservice/soap/smsService.php?wsdl",
        operation: "send_sms",
        args: (c) => ({
            username: c.username,
            password: c.password,
            sender_number: [c.sender],
            receiver_number: c.mobiles.map(zeroForm),
            note: [c.message],
            date: [],
            request_uniqueid: [],
            flash: false,
            onlysend: "ok",
        }),
        success: () => false,
        raw: (xml) => {
            const first = (xmlAll(xml, "string")[0] || "").replace(/,/g, "");
            const numeric = Number(stripTags(first));
            return Number.isFinite(numeric) && first !== "" ? null : "The gateway returned no delivery id.";
        },
    }));

    out.push(S("sepahansms", "SepahanSMS.com — سپاهان گستر", {
        wsdl: "https://www.sepahansms.com/smsSendWebServiceforphp.asmx?wsdl",
        operation: "SendSms",
        args: (c) => ({
            UserName: c.username,
            Pass: c.password,
            Domain: "sepahansms",
            SmsText: [c.message],
            MobileNumber: c.mobiles,
            SenderNumber: c.sender,
            sendType: "StaticText",
            smsMode: "SaveInPhone",
        }),
        resultTag: "SendSmsResult",
        success: () => false,
        raw: (xml) => {
            const ids = xmlAll(xml, "long").map((v) => Number(stripTags(v)));
            return ids.length ? null : "The gateway did not confirm delivery.";
        },
    }));

    out.push(S("_3300", "SMS.3300.ir — نگین ارتباط", {
        wsdl: "https://sms.3300.ir/almassms.asmx?wsdl",
        operation: "Send",
        args: (c) => ({
            pUsername: c.username,
            pPassword: c.password,
            line: c.sender,
            messages: { string: [c.message] },
            mobiles: { string: c.mobiles },
            Encodings: { int: [2] },
            mclass: { int: [1] },
        }),
        resultTag: "SendResult",
        // Negative result codes mean accepted.
        success: (v) => Number(v) < 0,
    }));

    out.push(S("tjp", "TJP.ir", {
        wsdl: "https://sms-login.tjp.ir/webservice/?WSDL",
        operation: "sendToMany",
        headers: (c) => ({ Authorization: `Basic ${Buffer.from(`${c.username}:${c.password}`).toString("base64")}` }),
        args: (c) => ({ to: c.mobiles, massage: c.message }),
        success: () => true,
    }));

    return out;
}
