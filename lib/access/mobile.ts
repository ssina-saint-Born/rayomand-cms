import { toEnglishDigits } from "./number";

// Mirrors the access layer Objects\Mobile using libphonenumber semantics. We implement
// the IR mobile handling directly: an E.164 style canonical form and the
// possible stored formats used to match users.
const VALID_IR = /^(?:\+98|0098|98|0)?9\d{9}$/;

function strip(value: string): string {
    return String(value ?? "").replace(/[^0-9+]/g, "");
}

export class Mobile {
    private formatted: string | null = null;

    constructor(value: string) {
        this.setValue(value);
    }

    setValue(value: string): void {
        const raw = toEnglishDigits(value);
        this.formatted = parseMobile(raw);
    }

    isValid(): boolean {
        return !!this.formatted;
    }

    // +9891XXXXXXX
    getFormatted(): string {
        return this.formatted || "";
    }

    // user_login form: +9891XXXXXXX sanitized to a safe username token.
    getSanitizedUsername(): string {
        const f = this.getFormatted();
        return f.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
    }

    // The possible storage formats for a mobile, so lookups match any variant.
    possibleFormats(): string[] {
        const f = this.formatted;
        if (!f)
            return [];
        const cc = f.slice(0, 3); // +98
        const national = f.slice(3); // 91...
        const out = new Set<string>([
            national,
            cc.slice(1) + national, // 98...
            f, // +98...
            "0" + national, // 091...
        ]);
        return Array.from(out);
    }

    // Returns the mobile with +98 converted to leading 0 (used for billing).
    withZero(): string {
        const f = this.formatted;
        if (!f)
            return "";
        if (f.startsWith("+98"))
            return "0" + f.slice(3);
        return f;
    }
}

export function parseMobile(value: string): string | null {
    const raw = strip(toEnglishDigits(value));
    if (!VALID_IR.test(raw))
        return null;
    let national = raw.replace(/\D/g, "");
    if (national.startsWith("00"))
        national = national.slice(2);
    if (national.startsWith("98"))
        national = national.slice(2);
    if (national.startsWith("0"))
        national = national.slice(1);
    return "+98" + national;
}