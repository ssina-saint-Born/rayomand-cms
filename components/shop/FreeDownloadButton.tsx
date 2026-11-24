"use client";
import { useI18n } from "@/components/LanguageProvider";

import React, { useId, useState } from "react";
import Link from "next/link";
import { useStore } from "./StoreContext";
import type { ShopProduct } from "@/lib/shop/products";
interface OfferState {
    offered: boolean;
    requireLogin: boolean;
    loginMessage: string;
    capture: boolean;
    limit: {
        active: boolean;
        allowed: boolean;
        remaining: number | null;
    };
    limitText: string;
    owned: boolean;
    count: number;
    countText: string;
}
export default function FreeDownloadButton({ product, variationId = 0, state, compact = false, }: {
    product: ShopProduct;
    variationId?: number;
    state?: OfferState;
    compact?: boolean;
}) {
    const { t: tr } = useI18n();
    const { settings, toast } = useStore();
    const som = settings?.downloads;
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState<{
        type: "success" | "error" | "info";
        text: string;
    } | null>(null);
    const [captureOpen, setCaptureOpen] = useState(false);
    const captureTitleId = useId();
    const [email, setEmail] = useState("");
    const [name, setName] = useState("");
    const [checked, setChecked] = useState<number[]>([]);
    const [pending, setPending] = useState<Record<string, any>>({});
    const files = product.files || [];
    const multi = files.length > 1;
    const display = multi ? som?.display_multi || "button_links" : som?.display_single || "button";
    const useCheckboxes = multi && display === "checkboxes";
    async function startDownload(payloadExtra: Record<string, any> = {}) {
        setBusy(true);
        setMessage(null);
        try {
            const res = await fetch("/api/downloads/download", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ product_id: product.id, variation_id: variationId, ...payloadExtra }),
            });
            const data = await res.json();
            if (!res.ok) {
                if (data.capture_required) {
                    if (captureOpen)
                        setMessage({ type: "error", text: data.message_key || data.error });
                    setPending(payloadExtra);
                    setCaptureOpen(true);
                    setBusy(false);
                    return;
                }
                if (data.require_login) {
                    setMessage({ type: "info", text: data.message_key || data.error });
                    setBusy(false);
                    return;
                }
                if (data.redirect_url) {
                    window.location.assign(data.redirect_url);
                    return;
                }
                setMessage({ type: "error", text: data.message_key || data.error || "Download failed." });
                setBusy(false);
                return;
            }
            setCaptureOpen(false);
            if (data.type === "direct") {
                const targets = data.zip ? [data.zip] : data.files;
                if (payloadExtra.view) {
                    window.open(targets[0].url, "_blank", "noopener,noreferrer");
                    setBusy(false);
                    return;
                }
                targets.forEach((f: {
                    name: string;
                    url: string;
                }, i: number) => {
                    setTimeout(() => {
                        const a = document.createElement("a");
                        a.href = f.url;
                        a.download = f.name;
                        document.body.appendChild(a);
                        a.click();
                        a.remove();
                    }, i * 450);
                });
                setMessage({ type: "success", text: data.zip ? "Your ZIP download has started." : "Your download has started." });
                toast("success", `Downloading ${product.name}…`);
            }
            else if (data.type === "email") {
                setMessage({ type: "info", text: data.message });
            }
            else if (data.type === "redirect") {
                window.location.assign(data.url);
                return;
            }
        }
        catch (e: any) {
            setMessage({ type: "error", text: e.message || "Download failed." });
        }
        setBusy(false);
    }
    function onClick() {
        if (useCheckboxes) {
            if (!checked.length) {
                setMessage({ type: "error", text: som?.checkbox_error_text || "Please select at least one file to download." });
                return;
            }
            startDownload({ files: checked });
        }
        else {
            startDownload();
        }
    }
    const btnText = som?.button_text || "Download Now";
    const asLink = !multi && display === "link";
    const btnClass = asLink
        ? `text-shop-purple font-bold hover:underline inline-flex items-center gap-1.5 ${som?.link_class || ""}`
        : `shop-btn shop-btn-free ${compact ? "shop-btn-sm" : ""} ${som?.button_class || ""}`;
    if (settings && !settings.enable_downloads)
        return null;
    if (state && !state.offered)
        return null;
    return (<div className={compact ? "" : "space-y-3"}>
      {state?.requireLogin ? (<div className="text-sm rounded-lg border border-shop-amber/50 bg-shop-amber/10 px-4 py-3 text-shop-ink">
          {tr(state.loginMessage)}{" "}
          <Link href="/auth/sign-in" className="font-bold text-shop-purple underline">{tr("Log in")}</Link>
        </div>) : (<>
          {useCheckboxes && (<div className="space-y-1.5 text-sm">
              <p className="font-semibold text-shop-ink">{tr(som?.file_list_text || tr("Files included:"))}</p>
              {files.map((f, i) => (<label key={i} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={checked.includes(i)} onChange={(e) => setChecked((prev) => e.target.checked ? [...prev, i] : prev.filter((x) => x !== i))}/>
                  <span className="text-shop-muted">{som?.show_filename ? f.name : tr("File {0}", {"0": String(i + 1 ?? "")})}</span>
                </label>))}
            </div>)}
          {display !== "links" && <button className={btnClass} disabled={busy} onClick={onClick}>
            {busy ? tr("Preparing…") : (<>{!asLink && <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>}{tr(btnText)}</>)}
          </button>}
          {multi && !useCheckboxes && (display === "button_links" || display === "links" || display === "filenames") && (<div className="text-xs space-y-1">
              <p className="font-semibold text-shop-muted">{tr(som?.file_list_text || tr("Files included:"))}</p>
              {files.map((f, i) => (<div key={i}>
                  {display === "filenames" ? (<span className="text-shop-muted">{f.name}</span>) : (<button className={`text-shop-purple font-semibold hover:underline ${som?.link_class || ""}`} onClick={() => startDownload({ files: [i] })}>
                      {tr(som?.link_text || tr("Download"))} {som?.show_filename ? f.name : tr("file {0}", {"0": String(i + 1 ?? "")})}
                    </button>)}
                </div>))}
            </div>)}
          {!compact && som?.docviewer_enable && files.some((f) => f.file.toLowerCase().endsWith(".pdf")) && (<div>
              {files.filter((f) => f.file.toLowerCase().endsWith(".pdf")).map((f, i) => (<button key={i} disabled={busy} onClick={() => startDownload({ files: [files.indexOf(f)], view: true })} className="text-xs font-semibold text-shop-blue hover:underline">
                  {tr(som?.docviewer_link_text || tr("View PDF"))} — {f.name}
                </button>))}
            </div>)}
        </>)}
      {state?.owned && som?.owned_include ? <p className="text-xs font-semibold text-shop-green">{tr("Owned")}</p> : null}
      {state?.limitText && <p className="text-xs font-semibold text-shop-purple">{tr(state.limitText)}</p>}
      {state && som?.download_counts ? <p className="text-xs text-shop-muted">{tr(state.countText)}</p> : null}
      {message && (<p className={`text-sm rounded-md px-3 py-2 ${message.type === "success" ? "bg-shop-green/10 text-shop-green" : message.type === "error" ? "bg-shop-red/10 text-shop-red" : "bg-shop-blue/10 text-shop-blue"}`}>
          {tr(message.text)}
        </p>)}

      {captureOpen && (<div className="noma-modal-scrim fixed inset-0 z-[80] flex items-center justify-center p-4" onClick={() => setCaptureOpen(false)} onKeyDown={(e) => {
                if (e.key === "Escape")
                    setCaptureOpen(false);
            }}>
          <div className="shop-card w-full max-w-md overflow-hidden" role="dialog" aria-modal="true" aria-labelledby={captureTitleId} onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4" style={{ background: !som?.capture_email_title_bg || som.capture_email_title_bg === "#7f54b3" ? "#656080" : som.capture_email_title_bg, color: som?.capture_email_title_colour || "#fff" }}>
              <h3 id={captureTitleId} className="font-bold text-lg">{tr(som?.capture_email_title || tr("Enter your email to download"))}</h3>
            </div>
            <div className="p-6 space-y-3">
              {message?.type === "error" && <p role="alert" className="text-sm text-shop-red">{tr(message.text)}</p>}
              <p className="text-sm text-shop-muted">{tr(som?.capture_email_body || "")}</p>
              <input autoFocus aria-label={tr("Email address")} className="shop-input" type="email" placeholder={tr(som?.capture_email_placeholder || tr("you@example.com"))} value={email} onChange={(e) => setEmail(e.target.value)}/>
              <input aria-label={tr("Your name (optional)")} className="shop-input" type="text" placeholder={tr("Your name (optional)")} value={name} onChange={(e) => setName(e.target.value)}/>
              {som?.capture_email_subscribe ? <p className="text-xs text-shop-muted">{tr("You'll also be subscribed to our newsletter. Unsubscribe anytime.")}</p> : null}
              <div className="flex gap-2 pt-1">
                <button className="shop-btn shop-btn-primary flex-1" disabled={busy} onClick={() => startDownload({ ...pending, email, name })}>
                  {busy ? tr("Preparing…") : tr(som?.capture_email_button || "Get my download")}
                </button>
                <button className="shop-btn shop-btn-outline" onClick={() => setCaptureOpen(false)}>{tr("Cancel")}</button>
              </div>
            </div>
          </div>
        </div>)}
    </div>);
}
