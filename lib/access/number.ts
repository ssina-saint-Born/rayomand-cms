// Mirrors the auth helpers\Number: convert Persian/Arabic digits to English.
const FA = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
const AR = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];

export function toEnglishDigits(value: string): string {
    let out = String(value ?? "");
    FA.forEach((d, i) => { out = out.split(d).join(String(i)); });
    AR.forEach((d, i) => { out = out.split(d).join(String(i)); });
    return out;
}

export function toPersianDigits(value: string): string {
    let out = String(value ?? "");
    for (let i = 0; i < 10; i++)
        out = out.split(String(i)).join(FA[i]);
    return out;
}