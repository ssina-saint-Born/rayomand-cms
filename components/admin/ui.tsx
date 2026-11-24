"use client";
import { useI18n } from "@/components/LanguageProvider";

import React from "react";
export function PageHeader({ title, action, }: {
    title: string;
    action?: React.ReactNode;
}) {
    const { t: tr } = useI18n();
    return (<div className="noma-page-heading">
      <div><p className="noma-eyebrow">{tr("Your workspace")}</p><h1 className="text-rm-dark">{tr(title)}</h1></div>
      {action}
    </div>);
}
export function Notice({ type = "info", children, }: {
    type?: "info" | "success" | "error" | "warning";
    children: React.ReactNode;
}) {
    const { t: tr } = useI18n();
    const colors: Record<string, string> = {
        info: "text-rm-blue bg-blue-50",
        success: "text-rm-green bg-green-50",
        error: "text-rm-red bg-red-50",
        warning: "text-rm-yellow bg-yellow-50",
    };
    return (<div className={`noma-notice ${colors[type]}`} role={type === "error" ? "alert" : "status"}>
      <span className="noma-notice-dot" aria-hidden="true"/><div>{typeof children === "string" ? tr(children) : children}</div>
    </div>);
}
export function Spinner({ label = "Loading…" }: {
    label?: string;
}) {
    const { t: tr } = useI18n();
    return (<div className="flex items-center gap-2 text-rm-muted text-sm py-8">
      <span className="inline-block w-4 h-4 border-2 border-rm-border border-t-rm-blue rounded-full animate-spin"/>
      {tr(label)}
    </div>);
}
export function EmptyState({ children }: {
    children: React.ReactNode;
}) {
    return (<div className="noma-empty">{children}</div>);
}
export function Card({ title, children, className = "", }: {
    title?: string;
    children: React.ReactNode;
    className?: string;
}) {
    const { t: tr } = useI18n();
    return (<div className={`rm-admin-card ${className}`}>
      {title && (<div className="noma-card-heading text-rm-dark">
          {tr(title)}
        </div>)}
      <div className="noma-card-content">{children}</div>
    </div>);
}
