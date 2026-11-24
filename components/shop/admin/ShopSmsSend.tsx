"use client";
import { useI18n } from "@/components/LanguageProvider";

import React, { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { ErrorNote, L, OkNote, ShopHeader } from "./shared";
import { useSmsBundle } from "./ShopSmsSettings";

export default function ShopSmsSend() {
    const { t: tr } = useI18n();
    const { bundle } = useSmsBundle();
    const [mobile, setMobile] = useState("");
    const [message, setMessage] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [msg, setMsg] = useState("");

    // Bulk::handle_bulk_actions() prefills the recipients from selected orders.
    useEffect(() => {
        const p = new URLSearchParams(window.location.search);
        const orders = p.get("orders");
        if (!orders)
            return;
        api<any>(`/api/commerce/sms/send?orders=${encodeURIComponent(orders)}`)
            .then((r) => { if (r.mobile)
            setMobile(r.mobile); })
            .catch((e) => setError(e.message));
    }, []);

    async function send() {
        setBusy(true);
        setError("");
        setMsg("");
        try {
            const r = await api<any>("/api/commerce/sms/send", { method: "POST", body: JSON.stringify({ mobile, message }) });
            setMsg(tr("SMS sent successfully."));
            if (r?.count)
                setMsg(tr("SMS sent successfully to {0} recipient(s).", { "0": String(r.count) }));
        }
        catch (e: any) {
            setError(e.message);
        }
        setBusy(false);
    }

    const gateway = String(bundle?.settings?.sms_gateway ?? "logger");
    return (<div>
      <ShopHeader title={tr("Send SMS")} sub={tr("Test the gateway connection and send a single or bulk message.")}/>
      <ErrorNote error={error}/>
      <OkNote msg={msg}/>

      <div className="rm-admin-card p-5 max-w-2xl space-y-4">
        <div className="rounded border border-rm-border bg-rm-gray/60 px-3 py-2 text-xs text-rm-muted">
          {tr("Active gateway:")}{" "}
          <span className="font-semibold text-rm-dark">{bundle?.gateways.find((g) => g.id === gateway)?.name || gateway}</span>
          {" — "}
          {gateway === "logger"
            ? tr("messages are written to the local log only, nothing leaves the server.")
            : tr("messages are sent to the live gateway.")}
        </div>
        <L label={tr("Recipients")} hint={tr("Mobile numbers separated by commas. Persian digits are accepted.")}>
          <textarea className="rm-input mt-1 font-mono text-xs" rows={3} dir="ltr" placeholder="09121234567, 09351234567" value={mobile} onChange={(e) => setMobile(e.target.value)}/>
        </L>
        <L label={tr("Message")}>
          <textarea className="rm-input mt-1" rows={5} dir="auto" value={message} onChange={(e) => setMessage(e.target.value)}/>
        </L>
        <div className="pt-2">
          <button className="rm-btn rm-btn-primary" style={{ background: "#656080", borderColor: "#656080" }} disabled={busy || !message.trim() || !mobile.trim()} onClick={send}>
            {busy ? tr("Sending…") : tr("Send SMS")}
          </button>
        </div>
        <p className="text-xs text-rm-muted">{tr("Every send is recorded in the SMS archive together with the gateway response.")}</p>
      </div>
    </div>);
}
