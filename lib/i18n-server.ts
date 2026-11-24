import { cookies } from "next/headers";
import { LOCALE_COOKIE, translate, validLocale } from "./i18n";
export function getLocale() { return validLocale(cookies().get(LOCALE_COOKIE)?.value); }
export function getTranslator() {
  const locale = getLocale();
  return (text: string, values?: Record<string, string | number>) => translate(locale, text, values);
}
