"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/components/LanguageProvider";
import { api } from "@/lib/client";
import { Notice, Spinner } from "../ui";

// Native webmail. Talks to the CMS's own mail engine through /api/webmail,
// so no external client or SSO bridge is involved.

interface Folder { id: number; name: string; special_use: string; unread: number; total: number; }
interface Summary {
    id: number; uid: number; subject: string; from: string; from_address: string;
    to: string; snippet: string; date: string; seen: boolean; flagged: boolean;
    has_attachments: boolean; size: number; spam_score: number;
}
interface Detail {
    id: number; subject: string;
    from: { name: string; address: string };
    to: Array<{ name: string; address: string }>;
    cc: Array<{ name: string; address: string }>;
    date: string; message_id: string; in_reply_to: string;
    text: string; html: string;
    attachments: Array<{ index: number; filename: string; content_type: string; size: number }>;
    flagged: boolean; spam_score: number;
}

const PAGE = 40;

function fmtDate(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime()))
        return "";
    const now = new Date();
    if (d.toDateString() === now.toDateString())
        return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function fmtSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
}

export default function WebmailClient() {
    const { t } = useI18n();
    const [state, setState] = useState<"checking" | "login" | "ready">("checking");
    const [address, setAddress] = useState("");
    const [folders, setFolders] = useState<Folder[]>([]);
    const [displayName, setDisplayName] = useState("");
    const [quotaMb, setQuotaMb] = useState(0);
    const [queued, setQueued] = useState(0);
    const [folder, setFolder] = useState("INBOX");
    const [messages, setMessages] = useState<Summary[]>([]);
    const [total, setTotal] = useState(0);
    const [offset, setOffset] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [query, setQuery] = useState("");
    const [unreadOnly, setUnreadOnly] = useState(false);
    const [selected, setSelected] = useState<Set<number>>(new Set());
    const [open, setOpen] = useState<Detail | null>(null);
    const [compose, setCompose] = useState<{ mode: "new" | "reply" | "forward"; to: string; cc: string; subject: string; text: string; inReplyTo?: string; references?: string[] } | null>(null);
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);

    const loadFolders = useCallback(async () => {
        const data = await api<{ address: string; display_name: string; quota_mb: number; queued: number; folders: Folder[] }>("/api/webmail/folders");
        setAddress(data.address);
        setDisplayName(data.display_name);
        setQuotaMb(data.quota_mb);
        setQueued(data.queued);
        setFolders(data.folders);
        return data.folders;
    }, []);

    const loadMessages = useCallback(async (targetFolder: string, nextOffset = 0, append = false, filters?: { query?: string; unreadOnly?: boolean }) => {
        setLoading(true);
        setError("");
        try {
            const search = (filters?.query ?? query).trim();
            const onlyUnread = filters?.unreadOnly ?? unreadOnly;
            const params = new URLSearchParams({ folder: targetFolder, limit: String(PAGE), offset: String(nextOffset) });
            if (search)
                params.set("q", search);
            if (onlyUnread)
                params.set("unread", "1");
            const data = await api<{ total: number; messages: Summary[] }>(`/api/webmail/messages?${params}`);
            setTotal(data.total);
            setOffset(nextOffset);
            setMessages((prev) => append ? [...prev, ...data.messages] : data.messages);
        }
        catch (e: any) {
            if (String(e.message).includes("signed in"))
                setState("login");
            else
                setError(e.message);
        }
        finally {
            setLoading(false);
        }
    }, [query, unreadOnly]);

    useEffect(() => {
        void (async () => {
            try {
                const session = await api<{ signed_in: boolean }>("/api/webmail/session");
                if (!session.signed_in) {
                    setState("login");
                    return;
                }
                await loadFolders();
                await loadMessages("INBOX");
                setState("ready");
            }
            catch {
                setState("login");
            }
        })();
    }, [loadFolders, loadMessages]);

    const selectFolder = async (name: string) => {
        setFolder(name);
        setSelected(new Set());
        setOpen(null);
        await loadMessages(name);
    };

    const toggle = (id: number) => {
        setSelected((prev) => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const openMessage = async (id: number) => {
        try {
            const detail = await api<Detail>(`/api/webmail/messages/${id}`);
            setOpen(detail);
            setMessages((prev) => prev.map((m) => m.id === id ? { ...m, seen: true } : m));
            void loadFolders();
        }
        catch (e: any) {
            setNotice({ type: "error", text: e.message });
        }
    };

    const bulk = async (action: string, value?: boolean) => {
        if (!selected.size)
            return;
        setBusy(true);
        try {
            await api("/api/webmail/messages", {
                method: "POST",
                body: JSON.stringify({ action, ids: [...selected], value }),
            });
            setSelected(new Set());
            await Promise.all([loadMessages(folder), loadFolders()]);
            if (open && (action === "delete" || action === "move"))
                setOpen(null);
        }
        catch (e: any) {
            setNotice({ type: "error", text: e.message });
        }
        finally {
            setBusy(false);
        }
    };

    const toggleFlag = async (detail: Detail) => {
        const next = !detail.flagged;
        setOpen({ ...detail, flagged: next });
        await api(`/api/webmail/messages/${detail.id}`, { method: "PATCH", body: JSON.stringify({ flagged: next }) });
        setMessages((prev) => prev.map((m) => m.id === detail.id ? { ...m, flagged: next } : m));
    };

    const startReply = (detail: Detail, mode: "reply" | "forward") => {
        const subject = mode === "reply"
            ? (detail.subject.startsWith("Re:") ? detail.subject : `Re: ${detail.subject}`)
            : (detail.subject.startsWith("Fwd:") ? detail.subject : `Fwd: ${detail.subject}`);
        const quoted = `\n\n--- ${mode === "reply" ? "Original message" : "Forwarded message"} ---\nFrom: ${detail.from.name} <${detail.from.address}>\nDate: ${new Date(detail.date).toLocaleString()}\n\n${detail.text}`;
        setCompose({
            mode,
            to: mode === "reply" ? detail.from.address : "",
            cc: "",
            subject,
            text: mode === "reply" ? `${quoted}` : quoted,
            inReplyTo: mode === "reply" ? detail.message_id : undefined,
            references: mode === "reply" ? [detail.message_id].filter(Boolean) : undefined,
        });
    };

    const send = async () => {
        if (!compose)
            return;
        setBusy(true);
        try {
            const result = await api<{ queued: number; deliveredLocal: number }>("/api/webmail/send", {
                method: "POST",
                body: JSON.stringify(compose),
            });
            setCompose(null);
            setNotice({
                type: "success",
                text: result.queued
                    ? t("Message queued for delivery.")
                    : t("Message delivered."),
            });
            await Promise.all([loadMessages(folder), loadFolders()]);
        }
        catch (e: any) {
            setNotice({ type: "error", text: e.message });
        }
        finally {
            setBusy(false);
        }
    };

    const saveDraft = async () => {
        if (!compose)
            return;
        setBusy(true);
        try {
            await api("/api/webmail/send", { method: "PUT", body: JSON.stringify(compose) });
            setCompose(null);
            setNotice({ type: "success", text: t("Draft saved.") });
            await loadFolders();
        }
        catch (e: any) {
            setNotice({ type: "error", text: e.message });
        }
        finally {
            setBusy(false);
        }
    };

    const logout = async () => {
        await api("/api/webmail/session", { method: "POST", body: JSON.stringify({ action: "logout" }) });
        setState("login");
        setMessages([]);
        setOpen(null);
    };

    const folderLabel = useMemo(() => (name: string) => {
        const known: Record<string, string> = {
            INBOX: t("Inbox"), Sent: t("Sent"), Drafts: t("Drafts"), Trash: t("Trash"),
            Junk: t("Junk"), Archive: t("Archive"), Spam: t("Junk"),
        };
        return known[name] || name;
    }, [t]);

    if (state === "checking")
        return <Spinner label={t("Connecting to your mailbox…")} />;
    if (state === "login")
        return <LoginScreen onDone={async () => { await loadFolders(); await loadMessages("INBOX"); setState("ready"); }} />;

    return (
        <div className="wm-shell">
            {notice && (
                <div className="mb-3">
                    <Notice type={notice.type}>{notice.text}</Notice>
                </div>
            )}

            <div className="wm-grid">
                <aside className="wm-side">
                    <div className="wm-account">
                        <div className="wm-avatar">{(displayName || address || "?").slice(0, 1).toUpperCase()}</div>
                        <div className="min-w-0">
                            <div className="wm-account-name truncate">{displayName || address}</div>
                            <div className="wm-account-addr truncate">{address}</div>
                        </div>
                    </div>
                    <button className="rm-btn rm-btn-primary wm-compose" onClick={() => setCompose({ mode: "new", to: "", cc: "", subject: "", text: "" })}>
                        <span aria-hidden>✎</span> {t("Compose")}
                    </button>
                    <nav className="wm-folders">
                        {folders.map((f) => (
                            <button
                                key={f.id}
                                className={`wm-folder ${folder === f.name ? "is-active" : ""}`}
                                onClick={() => selectFolder(f.name)}
                            >
                                <span className="truncate">{folderLabel(f.name)}</span>
                                {f.unread > 0 && <span className="wm-badge">{f.unread}</span>}
                            </button>
                        ))}
                    </nav>
                    <div className="wm-side-foot">
                        {quotaMb > 0 && <div className="wm-meta">{t("Quota")}: {quotaMb} MB</div>}
                        {queued > 0 && <div className="wm-meta">{t("Queued")}: {queued}</div>}
                        <button className="rm-btn rm-btn-ghost wm-logout" onClick={logout}>{t("Sign out")}</button>
                    </div>
                </aside>

                <section className="wm-list-col">
                    <div className="wm-toolbar">
                        <input
                            className="rm-input wm-search"
                            placeholder={t("Search mail…")}
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") void loadMessages(folder); }}
                        />
                        <button
                            className={`wm-chip ${unreadOnly ? "is-on" : ""}`}
                            onClick={() => {
                                const next = !unreadOnly;
                                setUnreadOnly(next);
                                void loadMessages(folder, 0, false, { unreadOnly: next });
                            }}
                            title={t("Unread only")}
                        >
                            {t("Unread")}
                        </button>
                        {selected.size > 0 && (
                            <div className="wm-bulk">
                                <span className="wm-bulk-count">{selected.size}</span>
                                <button className="wm-chip" onClick={() => bulk("read")}>{t("Read")}</button>
                                <button className="wm-chip" onClick={() => bulk("unread")}>{t("Unread")}</button>
                                <button className="wm-chip" onClick={() => bulk("flag", true)}>{t("Flag")}</button>
                                <button className="wm-chip wm-chip-danger" onClick={() => bulk("delete")}>{t("Delete")}</button>
                            </div>
                        )}
                    </div>

                    {error && <Notice type="error">{error}</Notice>}
                    {loading && messages.length === 0 && <Spinner label={t("Loading messages…")} />}
                    {!loading && messages.length === 0 && (
                        <div className="wm-empty">{query ? t("No messages match your search.") : t("This folder is empty.")}</div>
                    )}

                    <ul className="wm-list">
                        {messages.map((m) => (
                            <li key={m.id} className={`wm-row ${m.seen ? "" : "is-unread"} ${open?.id === m.id ? "is-open" : ""}`}>
                                <label className="wm-check" onClick={(e) => e.stopPropagation()}>
                                    <input type="checkbox" checked={selected.has(m.id)} onChange={() => toggle(m.id)} />
                                </label>
                                <button className="wm-row-btn" onClick={() => openMessage(m.id)}>
                                    <span className="wm-row-top">
                                        <span className="wm-row-from truncate">{m.from}</span>
                                        <span className="wm-row-date">{fmtDate(m.date)}</span>
                                    </span>
                                    <span className="wm-row-subject truncate">
                                        {m.flagged && <span className="wm-flag" aria-label={t("Flagged")}>★</span>}
                                        {m.has_attachments && <span className="wm-clip" aria-label={t("Attachment")}>📎</span>}
                                        {m.subject}
                                    </span>
                                    <span className="wm-row-snippet truncate">{m.snippet}</span>
                                </button>
                            </li>
                        ))}
                    </ul>

                    {messages.length < total && (
                        <div className="wm-more">
                            <button className="rm-btn rm-btn-secondary" disabled={loading} onClick={() => loadMessages(folder, offset + PAGE, true)}>
                                {loading ? t("Loading…") : t("Load more")}
                            </button>
                        </div>
                    )}
                </section>

                <section className="wm-read-col">
                    {open ? (
                        <article className="wm-reader">
                            <header className="wm-reader-head">
                                <div className="wm-reader-actions">
                                    <button className="wm-icon-btn" onClick={() => startReply(open, "reply")} title={t("Reply")}>↩</button>
                                    <button className="wm-icon-btn" onClick={() => startReply(open, "forward")} title={t("Forward")}>↪</button>
                                    <button className={`wm-icon-btn ${open.flagged ? "is-on" : ""}`} onClick={() => toggleFlag(open)} title={t("Flag")}>★</button>
                                    <button className="wm-icon-btn" onClick={async () => {
                                        await api("/api/webmail/messages", { method: "POST", body: JSON.stringify({ action: "delete", ids: [open.id] }) });
                                        setOpen(null);
                                        await Promise.all([loadMessages(folder), loadFolders()]);
                                    }} title={t("Delete")}>🗑</button>
                                    <button className="wm-icon-btn" onClick={() => setOpen(null)} title={t("Close")}>✕</button>
                                </div>
                                <h2 className="wm-reader-subject">{open.subject}</h2>
                                <div className="wm-reader-meta">
                                    <strong>{open.from.name || open.from.address}</strong>
                                    <span>&lt;{open.from.address}&gt;</span>
                                    <span>· {new Date(open.date).toLocaleString()}</span>
                                </div>
                                <div className="wm-reader-to">
                                    {t("To")}: {open.to.map((a) => a.name || a.address).join(", ") || "—"}
                                    {open.cc.length > 0 && <> · {t("Cc")}: {open.cc.map((a) => a.name || a.address).join(", ")}</>}
                                </div>
                                {open.spam_score > 0 && (
                                    <div className="wm-spam-note">{t("Spam score")}: {open.spam_score.toFixed(1)}</div>
                                )}
                            </header>

                            <div className="wm-reader-body">
                                {open.html
                                    ? <iframe title={open.subject} className="wm-html" sandbox="" srcDoc={wrapHtml(open.html)} />
                                    : <pre className="wm-text">{open.text || "—"}</pre>}
                            </div>

                            {open.attachments.length > 0 && (
                                <div className="wm-attachments">
                                    {open.attachments.map((a) => (
                                        <a key={a.index} className="wm-attachment" href={`/api/webmail/messages/${open.id}/attachments/${a.index}`}>
                                            <span className="wm-attachment-name truncate">{a.filename}</span>
                                            <span className="wm-attachment-size">{fmtSize(a.size)}</span>
                                        </a>
                                    ))}
                                </div>
                            )}
                        </article>
                    ) : (
                        <div className="wm-reader-placeholder">
                            <div className="wm-reader-glyph">✉</div>
                            <p>{t("Select a message to read it.")}</p>
                        </div>
                    )}
                </section>
            </div>

            {compose && (
                <div className="wm-modal-backdrop" onClick={() => setCompose(null)}>
                    <div className="wm-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="wm-modal-head">
                            <h3>{compose.mode === "new" ? t("New message") : compose.mode === "reply" ? t("Reply") : t("Forward")}</h3>
                            <button className="wm-icon-btn" onClick={() => setCompose(null)}>✕</button>
                        </div>
                        <div className="wm-modal-body">
                            <label className="wm-field"><span>{t("To")}</span>
                                <input className="rm-input" dir="ltr" value={compose.to} onChange={(e) => setCompose({ ...compose, to: e.target.value })} placeholder="name@example.com" />
                            </label>
                            <label className="wm-field"><span>{t("Cc")}</span>
                                <input className="rm-input" dir="ltr" value={compose.cc} onChange={(e) => setCompose({ ...compose, cc: e.target.value })} />
                            </label>
                            <label className="wm-field"><span>{t("Subject")}</span>
                                <input className="rm-input" value={compose.subject} onChange={(e) => setCompose({ ...compose, subject: e.target.value })} />
                            </label>
                            <label className="wm-field"><span>{t("Message")}</span>
                                <textarea className="rm-input wm-textarea" rows={12} value={compose.text} onChange={(e) => setCompose({ ...compose, text: e.target.value })} />
                            </label>
                        </div>
                        <div className="wm-modal-foot">
                            <button className="rm-btn rm-btn-secondary" onClick={saveDraft} disabled={busy}>{t("Save draft")}</button>
                            <button className="rm-btn rm-btn-primary" onClick={send} disabled={busy}>{busy ? t("Sending…") : t("Send")}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function wrapHtml(html: string): string {
    // Sandboxed iframe with no scripts; a base style keeps third-party mail
    // legible without letting it inherit the admin theme.
    return `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>
        body{margin:0;padding:4px 2px;font:14px/1.6 system-ui,sans-serif;color:#1f2a24;word-break:break-word}
        img{max-width:100%;height:auto}a{color:#45665b}table{max-width:100%}
    </style></head><body>${html}</body></html>`;
}

function LoginScreen({ onDone }: { onDone: () => Promise<void> }) {
    const { t } = useI18n();
    const [address, setAddress] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => { inputRef.current?.focus(); }, []);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
            await api("/api/webmail/session", { method: "POST", body: JSON.stringify({ action: "login", address, password }) });
            await onDone();
        }
        catch (err: any) {
            setError(err.message);
        }
        finally {
            setBusy(false);
        }
    };

    return (
        <div className="wm-login-wrap">
            <form className="wm-login" onSubmit={submit}>
                <div className="wm-login-mark">✉</div>
                <h1 className="wm-login-title">{t("Webmail")}</h1>
                <p className="wm-login-sub">{t("Sign in with your mailbox address and password.")}</p>
                {error && <Notice type="error">{error}</Notice>}
                <label className="wm-field"><span>{t("Email address")}</span>
                    <input ref={inputRef} className="rm-input" dir="ltr" autoComplete="username" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="you@example.com" />
                </label>
                <label className="wm-field"><span>{t("Password")}</span>
                    <input className="rm-input" dir="ltr" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
                </label>
                <button className="rm-btn rm-btn-primary w-full" disabled={busy || !address || !password}>
                    {busy ? t("Signing in…") : t("Sign in")}
                </button>
            </form>
        </div>
    );
}
