"use client";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Locale, LOCALE_COOKIE, translate } from "@/lib/i18n";
const Context = createContext<{ locale: Locale; setLocale: (locale: Locale) => void; t: (text: string, values?: Record<string, string | number>) => string } | null>(null);
export function LanguageProvider({ initialLocale, children }: { initialLocale: Locale; children: React.ReactNode }) {
  const [locale, updateLocale] = useState(initialLocale);
  const router = useRouter();
  useEffect(() => { updateLocale(initialLocale); }, [initialLocale]);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "fa" ? "rtl" : "ltr";
  }, [locale]);
  useEffect(() => {
    const fields = new Set<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>();
    const field = (target: EventTarget | null) => target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement ? target : null;
    const clear = (event: Event) => { const input = field(event.target); if (input && fields.has(input)) { input.setCustomValidity(""); fields.delete(input); } };
    const invalid = (event: Event) => {
      const input = field(event.target);
      if (!input || (input.validity.customError && !fields.has(input))) return;
      input.setCustomValidity("");
      const state = input.validity;
      if (state.valid) return;
      const message = state.valueMissing ? "Please fill out this field." : state.typeMismatch && input instanceof HTMLInputElement && input.type === "email" ? "Please enter a valid email address." : state.tooShort ? "Please lengthen this text to at least {0} characters." : state.rangeUnderflow || state.rangeOverflow ? "Please select a value within the allowed range." : "Please enter a valid value.";
      input.setCustomValidity(translate(locale, message, { "0": "minLength" in input ? input.minLength : 0 }));
      fields.add(input);
    };
    document.addEventListener("invalid", invalid, true);
    document.addEventListener("input", clear, true);
    document.addEventListener("change", clear, true);
    return () => { document.removeEventListener("invalid", invalid, true); document.removeEventListener("input", clear, true); document.removeEventListener("change", clear, true); fields.forEach(input => input.setCustomValidity("")); };
  }, [locale]);
  const setLocale = useCallback((next: Locale) => {
    document.cookie = `${LOCALE_COOKIE}=${next}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
    updateLocale(next);
    document.documentElement.lang = next;
    document.documentElement.dir = next === "fa" ? "rtl" : "ltr";
    router.refresh();
  }, [router]);
  const value = useMemo(() => ({ locale, setLocale, t: (text: string, values?: Record<string, string | number>) => translate(locale, text, values) }), [locale, setLocale]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useI18n() {
  const context = useContext(Context);
  if (!context) throw new Error("LanguageProvider is required");
  return context;
}
export default function LanguageSwitch() {
  const { locale, setLocale, t } = useI18n();
  return <button type="button" className="rayomand-language" onClick={() => setLocale(locale === "en" ? "fa" : "en")} aria-label={t("Change language")} title={t("Change language")}>
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a16 16 0 0 1 0 18 16 16 0 0 1 0-18"/></svg>
    <span lang={locale === "en" ? "fa" : "en"} dir={locale === "en" ? "rtl" : "ltr"}>{locale === "en" ? "فارسی" : "English"}</span>
  </button>;
}
