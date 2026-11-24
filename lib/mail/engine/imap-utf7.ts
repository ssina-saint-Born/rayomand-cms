// Modified UTF-7 (RFC 3501 §5.1.3) used for mailbox names. Non-ASCII folder
// names are encoded as &<base64 with , instead of />-. "&" itself is "&-".

export function decodeMailboxName(input: string): string {
    let out = "";
    let i = 0;
    while (i < input.length) {
        const ch = input[i];
        if (ch !== "&") {
            out += ch;
            i++;
            continue;
        }
        const end = input.indexOf("-", i);
        if (end === -1) {
            out += ch;
            i++;
            continue;
        }
        const encoded = input.slice(i + 1, end);
        if (!encoded) {
            out += "&";
            i = end + 1;
            continue;
        }
        try {
            const bytes = Buffer.from(encoded.replace(/,/g, "/"), "base64");
            out += decodeModifiedUtf16(bytes);
        }
        catch {
            out += input.slice(i, end + 1);
        }
        i = end + 1;
    }
    return out;
}

export function encodeMailboxName(input: string): string {
    let out = "";
    let i = 0;
    while (i < input.length) {
        const code = input.charCodeAt(i);
        if (code >= 0x20 && code <= 0x7e) {
            out += input[i] === "&" ? "&-" : input[i];
            i++;
            continue;
        }
        // Collect a run of non-ASCII (and optionally '&') characters.
        let run = "";
        while (i < input.length) {
            const c = input.charCodeAt(i);
            const isAscii = c >= 0x20 && c <= 0x7e;
            if (isAscii)
                break;
            run += input[i];
            i++;
        }
        const base64 = encodeModifiedUtf16(run).replace(/\//g, ",").replace(/=+$/, "");
        out += `&${base64}-`;
    }
    return out;
}

function decodeModifiedUtf16(bytes: Buffer): string {
    let out = "";
    for (let i = 0; i + 1 < bytes.length; i += 2) {
        const code = (bytes[i] << 8) | bytes[i + 1];
        // Surrogate pairs are already UTF-16 units, so emit them directly.
        out += String.fromCharCode(code);
    }
    return out;
}

function encodeModifiedUtf16(value: string): string {
    const bytes: number[] = [];
    for (let i = 0; i < value.length; i++) {
        const code = value.charCodeAt(i);
        bytes.push((code >> 8) & 0xff, code & 0xff);
    }
    return Buffer.from(bytes).toString("base64");
}
