import { Identifier } from "./identifier";

// Mirrors the auth services\ChannelService::get_message() but returns plain text
// (no HTML) so the client can render it without an injection surface.
const CHANNEL_LABELS: Record<string, string> = {
    bale: "پیام‌رسان بله",
    call: "تماس",
    sms: "پیامک",
    email: "ایمیل",
};

export function otpSentMessage(successfulChannels: string[], identifier: Identifier, hasAccount: boolean): string {
    const labels = successfulChannels
        .filter((c) => CHANNEL_LABELS[c])
        .map((c) => CHANNEL_LABELS[c]);
    const kind = hasAccount ? "تایید" : "عضویت";
    if (!labels.length)
        return "کد تایید ارسال شد.";
    return `کد ${kind} از طریق ${labels.join(" و ")} به ${identifier.getValue()} ارسال شد.`;
}

export function hasPasswordMarker(passwordHash: string | null | undefined): boolean {
    return !!passwordHash && !String(passwordHash).startsWith("NO_PASSWORD_");
}
