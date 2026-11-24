import { fa } from "./messages-fa";
export type Locale = "en" | "fa";
export const LOCALE_COOKIE = "rayomand_locale";
export function validLocale(value?: string): Locale { return value === "fa" ? "fa" : "en"; }
const patterns = Object.entries(fa).filter(([key]) => /\{\w+\}/.test(key)).sort(([a], [b]) => (a.match(/\{\w+\}/g)!.length - b.match(/\{\w+\}/g)!.length)).map(([key, value]) => {
  const names: string[] = [];
  const escaped = key.split(/(\{\w+\})/).map(part => {
    if (/^\{\w+\}$/.test(part)) { names.push(part.slice(1, -1)); return "(.+?)"; }
    return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }).join("");
  return { regex: new RegExp(`^${escaped}$`), names, value };
});
export function translate(locale: Locale, text: string, values?: Record<string, string | number>): string {
  let result = text;
  if (locale === "fa") {
    result = fa[text] ?? text;
    if (result === text && !values) {
      for (const pattern of patterns) {
        const match = text.match(pattern.regex);
        if (match) { result = pattern.value.replace(/\{(\w+)\}/g, (token, key) => match[pattern.names.indexOf(key) + 1] ?? token); break; }
      }
    }
  }
  if (values) result = result.replace(/\{(\w+)\}/g, (token, key) => values[key] == null ? token : String(values[key]));
  return result;
}
