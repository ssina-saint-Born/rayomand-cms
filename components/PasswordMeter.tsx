"use client";
import { useI18n } from "@/components/LanguageProvider";
import { passwordStrength } from "@/lib/access/password";

const COLORS = ["#d7ddd2", "#b3544c", "#b98a3f", "#7f9a5c", "#4c6c57"];

export default function PasswordMeter({ value }: { value: string }) {
    const { t: tr } = useI18n();
    const { score, level, checks } = passwordStrength(value);
    const labels = ["", tr("Weak"), tr("Medium"), tr("Good"), tr("Excellent")];
    const rules = [
        { ok: checks.length, label: tr("At least 8 characters") },
        { ok: checks.lower, label: tr("A lowercase letter") },
        { ok: checks.upper, label: tr("An uppercase letter") },
        { ok: checks.digit, label: tr("A digit") },
        { ok: checks.symbol, label: tr("A symbol") },
    ];
    return (<div className="mt-2">
      <div className="flex gap-1" aria-hidden="true">
        {[1, 2, 3, 4].map((i) => (
            <span key={i} className="h-1.5 flex-1 rounded-full transition-colors" style={{ background: i <= score ? COLORS[score] : "#e4e9e0" }}/>
        ))}
      </div>
      <div className="flex items-center justify-between mt-1.5">
        <span className="text-xs font-medium" style={{ color: score ? COLORS[score] : "#65756d" }}>{labels[score] || ""}</span>
      </div>
      <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
        {rules.map((r) => (
          <li key={r.label} className="flex items-center gap-1.5 text-[11px]" style={{ color: r.ok ? "#4c6c57" : "#89988d" }}>
            <span aria-hidden="true">{r.ok ? "✓" : "•"}</span><span>{r.label}</span>
          </li>
        ))}
      </ul>
    </div>);
}
