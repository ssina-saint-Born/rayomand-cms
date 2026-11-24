// Dynamic route params for public pages can arrive still percent-encoded
// (e.g. "نخستین-نوشته" -> "%D9%86...") depending on how Next resolves the
// request, while API route handlers receive them already decoded. Decode
// defensively so a Persian/non-latin slug always matches the stored value.
export function decodeSlug(value: string): string {
    if (!value) return value;
    if (!/%[0-9a-fA-F]{2}/.test(value)) return value;
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}
