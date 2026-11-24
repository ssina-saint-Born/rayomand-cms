import { Readable } from "node:stream";
import { authenticate, spf as spfCheck, dmarc as dmarcCheck } from "mailauth";
import { parseMessage, stripTags } from "./mime";
import { domainOf } from "./address";

// Inbound verification: SPF, DKIM and DMARC through mailauth, plus a small
// heuristic score used to decide between the inbox and the junk folder. The
// score is deliberately conservative: false positives lose real mail, so only
// strong signals add points.

export interface AuthCheck {
    spf: string;
    dkim: string;
    dmarc: string;
    arc: string;
    header: string;
    score: number;
    reasons: string[];
}

export async function checkInbound(input: {
    raw: Buffer;
    clientIp: string;
    helo: string;
    envelopeFrom: string;
    mailHostname: string;
}): Promise<AuthCheck> {
    const reasons: string[] = [];
    let score = 0;
    let spf = "none";
    let dkim = "none";
    let dmarc = "none";
    let arc = "none";

    try {
        const result: any = await authenticate(Readable.from(input.raw), {
            remoteAddress: input.clientIp,
            helo: input.helo,
            sender: input.envelopeFrom || undefined,
            mta: input.mailHostname || "localhost",
            dkim: true,
            spf: true,
            dmarc: true,
            arc: true,
        } as any);

        spf = result?.spf?.status?.result || "none";
        dmarc = result?.dmarc?.status?.result || "none";
        arc = result?.arc?.status?.result || "none";
        const dkimResults = (result?.dkim?.results || []) as any[];
        const passing = dkimResults.filter((r) => r.status?.result === "pass").length;
        dkim = passing > 0 ? "pass" : (dkimResults[0]?.status?.result || "none");

        if (spf === "fail")
            score += 3;
        if (dmarc === "fail")
            score += 3;
        else if (dmarc === "pass")
            score -= 1;
        if (dkim === "fail")
            score += 2;
    }
    catch {
        reasons.push("verification-unavailable");
    }

    if (spf === "fail") {
        reasons.push("spf-fail");
        // SPF alone is unreliable with forwarding, so it never rejects by itself.
    }
    if (dmarc === "fail")
        reasons.push("dmarc-fail");
    if (dkim === "fail")
        reasons.push("dkim-fail");
    if (spf === "pass" || dkim === "pass")
        score -= 1;

    return {
        spf,
        dkim,
        dmarc,
        arc,
        header: `spf=${spf} dkim=${dkim} dmarc=${dmarc}`,
        score: Math.max(0, score),
        reasons,
    };
}

// Additional heuristics applied to the parsed message, independent of DNS.
export async function heuristicScore(raw: Buffer, sender: string): Promise<{ score: number; reasons: string[] }> {
    const reasons: string[] = [];
    let score = 0;
    let parsed;
    try {
        parsed = await parseMessage(raw);
    }
    catch {
        return { score: 0, reasons };
    }
    const text = (parsed.text || stripTags(parsed.html || "")).toLowerCase();
    const subject = (parsed.subject || "").toLowerCase();

    const spamWords = [
        "viagra", "cialis", "casino", "lottery winner", "nigerian prince",
        "click here to claim", "urgent business proposal", "wire transfer",
        "you have won", "congratulations you won", "act now", "risk-free investment",
    ];
    const hits = spamWords.filter((w) => text.includes(w) || subject.includes(w));
    if (hits.length) {
        score += Math.min(hits.length * 2, 6);
        reasons.push(`keywords:${hits.slice(0, 3).join(",")}`);
    }

    const links = (parsed.html || "").match(/https?:\/\/[^"'\s>]+/gi) || [];
    const linkHosts = new Set(links.map((l) => {
        try { return new URL(l).hostname.toLowerCase(); } catch { return ""; }
    }).filter(Boolean));
    if (linkHosts.size > 12) {
        score += 2;
        reasons.push("many-links");
    }

    if (!parsed.from) {
        score += 2;
        reasons.push("no-from-header");
    }
    else if (sender && parsed.from.address !== sender.toLowerCase()) {
        // A display name that claims one address but sends from another.
        score += 1;
        reasons.push("from-mismatch");
    }

    const senderDomain = domainOf(sender);
    const linkOnSenderDomain = Array.from(linkHosts).some((h) => h === senderDomain || h.endsWith("." + senderDomain));
    if (links.length && !linkOnSenderDomain && linkHosts.size > 0)
        score += 1;

    if (/\.(exe|scr|bat|cmd|js|vbs|jar|ps1)$/i.test(parsed.attachments.map((a) => a.filename).join(" "))) {
        score += 3;
        reasons.push("dangerous-attachment");
    }

    if (parsed.attachments.length > 5) {
        score += 1;
        reasons.push("many-attachments");
    }

    return { score: Math.max(0, score), reasons };
}

export { spfCheck, dmarcCheck };
