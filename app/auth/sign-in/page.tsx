"use client";
import { useI18n } from "@/components/LanguageProvider";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import BrandMark from "@/components/BrandMark";
import LanguageSwitch from "@/components/LanguageProvider";
import PasswordMeter from "@/components/PasswordMeter";

type Step = "identifier" | "password" | "otp" | "forgot" | "change" | "setup";

interface AuthData {
    has_password?: boolean;
    has_account?: boolean;
    login_method?: string;
    ttl?: number;
    jwt?: string;
    back_url?: string;
}

const digitsOnly = (v: string) => v.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/\D/g, "");

export default function LoginPage() {
    const { t: tr } = useI18n();
    const router = useRouter();

    const [step, setStep] = useState<Step>("identifier");
    const [identifier, setIdentifier] = useState("");
    const [password, setPassword] = useState("");
    const [code, setCode] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [resetJwt, setResetJwt] = useState("");
    const [resetKey, setResetKey] = useState("");
    const [jwt, setJwt] = useState("");
    const [message, setMessage] = useState("");
    const [codeLength, setCodeLength] = useState(4);
    const [ttl, setTtl] = useState(0);
    const [backUrl, setBackUrl] = useState("");
    const [setupToken, setSetupToken] = useState("");
    const [siteTitle, setSiteTitle] = useState("Rayomand CMS");
    const [email, setEmail] = useState("");
    const [username, setUsername] = useState("");

    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const [checking, setChecking] = useState(true);
    const [showPassword, setShowPassword] = useState(false);
    const codeRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        api<{ required: boolean }>("/api/auth/setup").then(data => { if (data.required) setStep("setup"); }).catch(err => setError(err.message)).finally(() => setChecking(false));
    }, []);

    useEffect(() => {
        if (step !== "otp" && step !== "forgot") return;
        if (ttl <= 0) return;
        const t = setTimeout(() => setTtl((v) => v - 1), 1000);
        return () => clearTimeout(t);
    }, [ttl, step]);

    useEffect(() => {
        if (step === "otp") codeRef.current?.focus();
    }, [step]);

    async function authenticate(extra: Record<string, any> = {}, nextStep?: Step) {
        setError(""); setBusy(true);
        try {
            const data = await api<{ success: boolean; message: string | null; data: AuthData }>("/api/access/authenticate", {
                method: "POST",
                body: JSON.stringify({ identifier, back_url: window.location.origin + "/studio", ...extra }),
            });
            const d = data.data || {};
            if (!data.success) { setError(data.message || ""); setBusy(false); return; }
            if (d.jwt) setJwt(d.jwt);
            if (d.ttl) setTtl(Number(d.ttl));
            if (d.back_url) setBackUrl(d.back_url);
            if (data.message) setMessage(data.message);
            const method = d.login_method || "otp";
            if (nextStep) setStep(nextStep);
            else if (d.jwt && method === "otp") setStep(extra.forget ? "forgot" : "otp");
            else if (method === "password") setStep("password");
            else setStep("otp");
        } catch (err: any) { setError(err.message || "Something went wrong"); }
        setBusy(false);
    }

    async function submitPassword(e: React.FormEvent) {
        e.preventDefault(); setError(""); setBusy(true);
        try {
            await api("/api/access/login/password", { method: "POST", body: JSON.stringify({ identifier, password }) });
            finish();
        } catch (err: any) { setError(err.message || "Something went wrong"); setBusy(false); }
    }

    async function submitOtp(e?: React.FormEvent, submitted?: string) {
        e?.preventDefault(); setError(""); setBusy(true);
        const value = submitted ?? code;
        try {
            await api("/api/access/login/otp", { method: "POST", body: JSON.stringify({ jwt, code: value }) });
            finish();
        } catch (err: any) { setError(err.message || "Something went wrong"); setBusy(false); setCode(""); }
    }

    async function submitForgot(e?: React.FormEvent, submitted?: string) {
        e?.preventDefault(); setError(""); setBusy(true);
        const value = submitted ?? code;
        try {
            const data = await api<{ success: boolean; message: string | null; data: { jwt: string; reset_key: string } }>("/api/access/auth/forgot/verify", {
                method: "POST", body: JSON.stringify({ jwt, code: value }),
            });
            if (!data.success) { setError(data.message || ""); setBusy(false); setCode(""); return; }
            setResetJwt(data.data.jwt); setResetKey(data.data.reset_key);
            setStep("change");
        } catch (err: any) { setError(err.message || "Something went wrong"); setCode(""); }
        setBusy(false);
    }

    async function submitChange(e: React.FormEvent) {
        e.preventDefault(); setError("");
        if (newPassword !== confirmPassword) { setError(tr("رمز عبور و تکرار رمز عبور یکسان نیستند.")); return; }
        setBusy(true);
        try {
            await api("/api/access/auth/forgot/change", {
                method: "POST",
                body: JSON.stringify({ jwt: resetJwt, reset_key: resetKey, password_1: newPassword, password_2: confirmPassword }),
            });
            finish();
        } catch (err: any) { setError(err.message || "Something went wrong"); setBusy(false); }
    }

    async function submitCore(e: React.FormEvent) {
        e.preventDefault(); setError(""); setBusy(true);
        try {
            await api(`/api/auth/${step === "setup" ? "setup" : "login"}`, {
                method: "POST",
                body: JSON.stringify({ username, password, email, setup_token: setupToken, site_title: siteTitle }),
            });
            finish();
        } catch (err: any) { setError(err.message || "Something went wrong"); setBusy(false); }
    }

    function finish() {
        router.push(backUrl || "/studio");
        router.refresh();
    }

    const title =
        step === "setup" ? tr("Your own beginning.")
        : step === "password" ? tr("Enter your password.")
        : step === "otp" ? tr("Enter the code.")
        : step === "forgot" ? tr("Reset your password.")
        : step === "change" ? tr("Choose a new password.")
        : tr("Welcome back.");

    const subtitle =
        step === "setup" ? tr("Create the first owner. Your PostgreSQL workspace starts empty, without demo accounts or content.")
        : step === "password" ? tr("Sign in with your password to continue.")
        : step === "otp" ? message
        : step === "forgot" ? message
        : step === "change" ? tr("Use at least 8 characters with an uppercase letter, a lowercase letter, a digit and a symbol.")
        : tr("Sign in with your mobile, email or username.");

    return <div className="noma-login" data-auth-ready={checking ? "0" : "1"}>
    <div className="rayomand-login-language"><LanguageSwitch /></div>
    <section className="noma-login-story" aria-label={tr("Rayomand CMS workspace")}>
      <div className="noma-login-brand"><BrandMark /><strong>{tr("Rayomand CMS")}</strong></div>
      <div><h2>{tr("A little space.")}<br />{tr("A lot of possibility.")}</h2><p>{tr("Write your next story, build a collection and make something worth sharing. All in one calm workspace.")}</p></div>
      <span className="noma-login-foot">{tr("PUBLISH · CREATE · CONNECT")}</span>
    </section>
    <main className="noma-login-form"><div>
      <p className="noma-eyebrow">{tr("Your creative workspace")}</p>
      <h1>{title}</h1>
      <p className="text-sm text-rm-muted mb-8" dir={step === "otp" || step === "forgot" ? "rtl" : undefined}>{subtitle || tr("Sign in and pick up where you left off.")}</p>
      {error && <div className="noma-notice bg-red-50 text-rm-red" role="alert">{tr(error)}</div>}

      {step === "setup" && <form onSubmit={submitCore} className="space-y-5">
        <div><label htmlFor="setup-token" className="block text-sm font-medium mb-2">{tr("Setup token")}</label><input id="setup-token" type="password" className="rm-input" value={setupToken} onChange={e => setSetupToken(e.target.value)} autoComplete="off" required /><p className="text-xs text-rm-muted mt-2">{tr("Read SETUP_TOKEN from your private .env file. Never share it.")}</p></div>
        <div><label htmlFor="site-title" className="block text-sm font-medium mb-2">{tr("Workspace name")}</label><input id="site-title" className="rm-input" value={siteTitle} onChange={e => setSiteTitle(e.target.value)} required /></div>
        <div><label htmlFor="login-username" className="block text-sm font-medium text-rm-text mb-2">{tr("Username")}</label><input id="login-username" className="rm-input" value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" required /></div>
        <div><label htmlFor="login-email" className="block text-sm font-medium text-rm-text mb-2">{tr("Email")}</label><input id="login-email" type="email" className="rm-input" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required /></div>
        <div><label htmlFor="login-password" className="block text-sm font-medium text-rm-text mb-2">{tr("Password")}</label><input id="login-password" type="password" className="rm-input" value={password} onChange={e => setPassword(e.target.value)} minLength={12} autoComplete="new-password" required /></div>
        <button type="submit" disabled={busy || checking} className="rm-btn rm-btn-primary w-full">{checking ? tr("Checking database…") : busy ? tr("Please wait…") : tr("Create workspace")}</button>
      </form>}

      {step === "identifier" && <form onSubmit={(e) => { e.preventDefault(); authenticate(); }} className="space-y-5">
        <div>
          <label htmlFor="sentinel-identifier" className="block text-sm font-medium text-rm-text mb-2">{tr("Mobile, username or email")}</label>
          <input id="sentinel-identifier" className="rm-input" value={identifier} onChange={e => setIdentifier(e.target.value)} autoComplete="username" autoFocus required dir="ltr" placeholder="0912… / you@site.com" />
        </div>
        <button type="submit" disabled={busy || checking || !identifier.trim()} className="rm-btn rm-btn-primary w-full">{busy ? tr("Please wait…") : tr("Continue")}</button>
      </form>}

      {step === "password" && <form onSubmit={submitPassword} className="space-y-5">
        <div>
          <label htmlFor="sentinel-password" className="block text-sm font-medium text-rm-text mb-2">{tr("Password")}</label>
          <div className="relative">
            <input id="sentinel-password" type={showPassword ? "text" : "password"} className="rm-input pe-12" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" autoFocus required />
            <button type="button" onClick={() => setShowPassword(s => !s)} className="absolute inset-y-0 end-3 text-xs text-rm-muted" aria-label={tr("Toggle password visibility")}>{showPassword ? tr("Hide") : tr("Show")}</button>
          </div>
        </div>
        <button type="submit" disabled={busy || !password} className="rm-btn rm-btn-primary w-full">{busy ? tr("Please wait…") : tr("Sign in")}</button>
        <div className="flex flex-col gap-2 text-sm">
          <button type="button" className="text-rm-blue font-medium text-start" onClick={() => authenticate({ force_otp: 1 })}>{tr("Sign in with a one-time code")}</button>
          <button type="button" className="text-rm-blue font-medium text-start" onClick={() => authenticate({ forget: 1 })}>{tr("Forgot your password?")}</button>
        </div>
      </form>}

      {(step === "otp" || step === "forgot") && <form onSubmit={step === "forgot" ? submitForgot : submitOtp} className="space-y-5">
        <div>
          <label htmlFor="sentinel-code" className="block text-sm font-medium text-rm-text mb-2">{tr("Verification code")}</label>
          <input id="sentinel-code" ref={codeRef} className="rm-input text-center tracking-[0.4em]" inputMode="numeric" dir="ltr" autoComplete="one-time-code" maxLength={codeLength} value={code} onChange={e => { const v = digitsOnly(e.target.value).slice(0, codeLength); setCode(v); if (v.length === codeLength) setTimeout(() => (step === "forgot" ? submitForgot(undefined, v) : submitOtp(undefined, v)), 50); }} required />
        </div>
        <button type="submit" disabled={busy || code.length < codeLength} className="rm-btn rm-btn-primary w-full">{busy ? tr("Please wait…") : tr("Confirm")}</button>
        <div className="flex items-center justify-between gap-3 text-sm">
          <button type="button" disabled={ttl > 0 || busy} className="text-rm-blue font-medium disabled:text-rm-muted disabled:font-normal" onClick={() => authenticate(step === "forgot" ? { forget: 1, force_otp: 1 } : { force_otp: 1 })}>{ttl > 0 ? tr("Resend in {s}s", { s: ttl }) : tr("Resend code")}</button>
          {step === "otp" && <button type="button" className="text-rm-muted hover:text-rm-blue" onClick={() => setStep("password")}>{tr("Use password instead")}</button>}
        </div>
      </form>}

      {step === "change" && <form onSubmit={submitChange} className="space-y-5">
        <div><label htmlFor="sentinel-new" className="block text-sm font-medium text-rm-text mb-2">{tr("New password")}</label><input id="sentinel-new" type="password" className="rm-input" value={newPassword} onChange={e => setNewPassword(e.target.value)} autoComplete="new-password" required /><PasswordMeter value={newPassword}/></div>
        <div><label htmlFor="sentinel-confirm" className="block text-sm font-medium text-rm-text mb-2">{tr("Confirm password")}</label><input id="sentinel-confirm" type="password" className="rm-input" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} autoComplete="new-password" required /></div>
        <button type="submit" disabled={busy || !newPassword || !confirmPassword} className="rm-btn rm-btn-primary w-full">{busy ? tr("Please wait…") : tr("Save password")}</button>
      </form>}

      <div className="mt-6 flex items-center justify-between gap-4 text-sm">
        <a href="/" className="text-rm-muted hover:text-rm-blue">{tr("← Back to site")}</a>
        {step !== "identifier" && step !== "setup" && <button className="text-rm-blue font-medium" onClick={() => { setStep("identifier"); setError(""); setCode(""); setMessage(""); setPassword(""); }}>{tr("Start over")}</button>}
      </div>
    </div></main>
  </div>;
}
