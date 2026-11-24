// Minimal MIME tree parser. IMAP BODYSTRUCTURE must describe the real part
// tree, so we parse it from the stored bytes rather than guessing from headers.

export interface MimePart {
    type: string;          // "text/plain"
    params: Record<string, string>;
    encoding: string;      // "base64", "quoted-printable", "7bit"
    id: string;
    description: string;
    size: number;          // body octets in the stored message
    lines: number;         // line count for text parts
    disposition: string;   // "attachment", "inline", ""
    dispositionParams: Record<string, string>;
    children: MimePart[];
    subtype: string;       // for multipart: "mixed", "alternative", "signed"
}

const EMPTY: MimePart = {
    type: "text/plain", params: {}, encoding: "7bit", id: "", description: "",
    size: 0, lines: 0, disposition: "", dispositionParams: {}, children: [], subtype: "",
};

export function parseMimeTree(raw: Buffer): MimePart {
    const { header, body } = split(raw);
    const headers = parseHeaders(header);
    return buildPart(headers, body, Buffer.byteLength(header, "binary"));
}

function buildPart(headers: Record<string, string>, body: Buffer, headerSize: number): MimePart {
    const contentType = headers["content-type"] || "text/plain";
    const { value: type, params } = parseStructured(contentType);
    const [mainType, subtype = ""] = type.toLowerCase().split("/");
    const part: MimePart = {
        ...EMPTY,
        type: `${mainType}/${subtype || "plain"}`,
        subtype,
        params,
        encoding: (headers["content-transfer-encoding"] || "7bit").toLowerCase(),
        id: stripAngles(headers["content-id"] || ""),
        description: headers["content-description"] || "",
        size: body.length,
        lines: mainType === "text" ? countLines(body) : 0,
        disposition: "",
        dispositionParams: {},
        children: [],
    };

    if (headers["content-disposition"]) {
        const disp = parseStructured(headers["content-disposition"]);
        part.disposition = disp.value.toLowerCase();
        part.dispositionParams = disp.params;
    }

    if (mainType === "multipart") {
        const boundary = params["boundary"] || "";
        if (boundary)
            part.children = splitMultipart(body, boundary).map((chunk) => {
                const split2 = split(chunk);
                return buildPart(parseHeaders(split2.header), split2.body, Buffer.byteLength(split2.header, "binary"));
            });
    }

    void headerSize;
    return part;
}

function splitMultipart(body: Buffer, boundary: string): Buffer[] {
    const text = body.toString("binary");
    const delimiter = `--${boundary}`;
    const parts: Buffer[] = [];
    const positions: number[] = [];
    let index = 0;
    while ((index = text.indexOf(delimiter, index)) !== -1) {
        positions.push(index);
        index += delimiter.length;
    }
    for (let i = 0; i < positions.length; i++) {
        const start = positions[i] + delimiter.length;
        const rest = text.slice(start, start + 2);
        if (rest.startsWith("--"))
            break;
        const end = i + 1 < positions.length ? positions[i + 1] : text.length;
        let chunk = text.slice(start, end);
        if (chunk.startsWith("\r\n"))
            chunk = chunk.slice(2);
        else if (chunk.startsWith("\n"))
            chunk = chunk.slice(1);
        if (chunk.endsWith("\r\n"))
            chunk = chunk.slice(0, -2);
        else if (chunk.endsWith("\n"))
            chunk = chunk.slice(0, -1);
        parts.push(Buffer.from(chunk, "binary"));
    }
    return parts;
}

function split(raw: Buffer): { header: string; body: Buffer } {
    const text = raw.toString("binary");
    const crlf = text.indexOf("\r\n\r\n");
    if (crlf !== -1)
        return { header: text.slice(0, crlf + 2), body: raw.subarray(crlf + 4) };
    const lf = text.indexOf("\n\n");
    if (lf !== -1)
        return { header: text.slice(0, lf + 1), body: raw.subarray(lf + 2) };
    return { header: text, body: Buffer.alloc(0) };
}

function parseHeaders(header: string): Record<string, string> {
    const out: Record<string, string> = {};
    const lines = header.split(/\r?\n/);
    let current = "";
    for (const line of lines) {
        if (/^[ \t]/.test(line) && current) {
            out[current] = (out[current] || "") + " " + line.trim();
            continue;
        }
        const colon = line.indexOf(":");
        if (colon === -1)
            continue;
        current = line.slice(0, colon).trim().toLowerCase();
        out[current] = line.slice(colon + 1).trim();
    }
    return out;
}

// Parse "text/plain; charset=utf-8; name=\"a.txt\"" into value and parameters.
function parseStructured(input: string): { value: string; params: Record<string, string> } {
    const segments = splitSemicolon(input);
    const value = (segments.shift() || "").trim();
    const params: Record<string, string> = {};
    for (const segment of segments) {
        const eq = segment.indexOf("=");
        if (eq === -1)
            continue;
        const key = segment.slice(0, eq).trim().toLowerCase();
        let val = segment.slice(eq + 1).trim();
        if (val.startsWith('"') && val.endsWith('"'))
            val = val.slice(1, -1).replace(/\\(.)/g, "$1");
        params[key] = val;
    }
    return { value, params };
}

function splitSemicolon(input: string): string[] {
    const out: string[] = [];
    let current = "";
    let quoted = false;
    for (const ch of input) {
        if (ch === '"')
            quoted = !quoted;
        if (ch === ";" && !quoted) {
            out.push(current);
            current = "";
            continue;
        }
        current += ch;
    }
    out.push(current);
    return out;
}

function stripAngles(value: string): string {
    return value.trim().replace(/^<|>$/g, "");
}

function countLines(buffer: Buffer): number {
    let count = 0;
    for (let i = 0; i < buffer.length; i++)
        if (buffer[i] === 0x0a)
            count++;
    return count;
}
