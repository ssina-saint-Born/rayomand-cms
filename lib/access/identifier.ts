import { toEnglishDigits } from "./number";
import { Mobile } from "./mobile";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type IdentifierType = "email" | "mobile" | "username";

// Mirrors the access layer Objects\Identifier: normalizes input and detects whether it
// is an email, a valid IR mobile, or a username.
export class Identifier {
    private value: string;
    private type: IdentifierType | "" = "";

    constructor(value: string) {
        this.value = toEnglishDigits(value).trim();
        if (EMAIL_RE.test(this.value)) {
            this.type = "email";
            return;
        }
        const mobile = new Mobile(this.value);
        if (mobile.isValid()) {
            this.type = "mobile";
            this.value = mobile.getFormatted();
            return;
        }
        if (/^[a-z0-9_.-]+$/i.test(this.value)) {
            this.type = "username";
        }
    }

    isValid(): boolean {
        return !!this.type;
    }
    isEmail(): boolean {
        return this.type === "email";
    }
    isMobile(): boolean {
        return this.type === "mobile";
    }
    isUsername(): boolean {
        return this.type === "username";
    }
    getValue(): string {
        return this.value;
    }
    getType(): IdentifierType {
        return this.type || "username";
    }
}