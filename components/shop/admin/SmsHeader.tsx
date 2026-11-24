"use client";
import { useI18n } from "@/components/LanguageProvider";

import Link from "next/link";

const TABS = [
    { id: "settings", href: "/studio/commerce/sms/settings", label: "Settings" },
    { id: "send", href: "/studio/commerce/sms/send", label: "Send SMS" },
    { id: "archive", href: "/studio/commerce/sms/archive", label: "Archive" },
    { id: "contacts", href: "/studio/commerce/sms/contacts", label: "Subscribers" },
];

export function SmsHeader({ tab }: {
    tab: string;
}) {
    const { t: tr } = useI18n();
    return (<div className="noma-tab-strip mb-4" aria-label={tr("SMS sections")}>
      {TABS.map((t) => (<Link key={t.id} href={t.href} className="noma-tab" aria-current={tab === t.id ? "page" : undefined} style={tab === t.id ? { borderColor: "#656080", color: "#656080" } : undefined}>
          {tr(t.label)}
        </Link>))}
    </div>);
}
