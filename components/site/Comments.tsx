"use client";
import { useI18n } from "@/components/LanguageProvider";

import React, { useEffect, useState } from "react";
import type { Comment, User } from "@/lib/types";
import { api } from "@/lib/client";
import { formatDate } from "@/lib/format";
export default function Comments({ postId, accent, open, }: {
    postId: number;
    accent: string;
    open: boolean;
}) {
    const { t: tr, locale } = useI18n();
    const [comments, setComments] = useState<Comment[]>([]);
    const [me, setMe] = useState<User | null>(null);
    const [form, setForm] = useState({ author_name: "", author_email: "", content: "" });
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState("");
    const [replyTo, setReplyTo] = useState<number>(0);
    async function load() {
        try {
            const data = await api<{
                items: Comment[];
            }>(`/api/content/comments?post=${postId}&status=approved&per_page=200`);
            setComments(data.items);
        }
        catch { }
    }
    useEffect(() => {
        load();
        api<{
            user: User | null;
        }>("/api/auth/me").then((d) => setMe(d.user)).catch(() => { });
    }, [postId]);
    async function submit(e: React.FormEvent) {
        e.preventDefault();
        setBusy(true);
        setMsg("");
        try {
            const payload: any = { post: postId, content: form.content, parent: replyTo };
            if (!me) {
                payload.author_name = form.author_name;
                payload.author_email = form.author_email;
            }
            const res = await api<{
                status: string;
            }>("/api/content/comments", { method: "POST", body: JSON.stringify(payload) });
            setForm({ author_name: "", author_email: "", content: "" });
            setReplyTo(0);
            setMsg(res.status === "approved" ? "Comment posted." : "Your comment is awaiting moderation.");
            await load();
        }
        catch (e: any) {
            setMsg(e.message);
        }
        setBusy(false);
    }
    const roots = comments.filter((c) => c.parent_id === 0);
    const childrenOf = (id: number) => comments.filter((c) => c.parent_id === id);
    function renderComment(c: Comment, depth = 0) {
        return (<div key={c.id} style={{ marginLeft: depth * 24 }} className="mb-4">
        <div className="rm-admin-card p-5">
          <div className="text-sm font-semibold">{c.author_name}</div>
          <div className="text-xs text-gray-400 mb-2">{formatDate(c.created_at, undefined, locale)}</div>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{c.content}</p>
          {open && (<button onClick={() => setReplyTo(c.id)} className="text-xs mt-2 hover:underline" style={{ color: accent }}>
              {tr("Reply")}</button>)}
        </div>
        {childrenOf(c.id).map((child) => renderComment(child, depth + 1))}
      </div>);
    }
    return (<section className="mt-12">
      <h3 className="text-xl font-bold mb-4">
        {comments.length} {comments.length === 1 ? tr("Comment") : tr("Comments")}
      </h3>
      {comments.length === 0 && <p className="text-sm text-gray-500 mb-6">{tr("No comments yet. Be the first!")}</p>}
      <div className="mb-8">{roots.map((c) => renderComment(c))}</div>

      {open ? (<div className="border-t border-gray-200 pt-6">
          <h4 className="font-semibold mb-3">{tr("Leave a Reply")}{" "}{replyTo ? <button onClick={() => setReplyTo(0)} className="text-xs font-normal text-gray-500 hover:underline">{tr("(cancel reply)")}</button> : null}</h4>
          {msg && <p className="text-sm mb-3" style={{ color: accent }}>{tr(msg)}</p>}
          {me && <p className="text-sm text-gray-500 mb-3">{tr("Logged in as")}{" "}<strong>{me.display_name}</strong>.</p>}
          <form onSubmit={submit} className="space-y-3 max-w-xl">
            {!me && (<div className="grid grid-cols-2 gap-3">
                <input className="rm-input" placeholder={tr("Name *")} value={form.author_name} onChange={(e) => setForm({ ...form, author_name: e.target.value })} required/>
                <input className="rm-input" type="email" placeholder={tr("Email *")} value={form.author_email} onChange={(e) => setForm({ ...form, author_email: e.target.value })} required/>
              </div>)}
            <textarea className="rm-input min-h-[100px]" placeholder={tr("Your comment *")} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} required/>
            <button className="rm-btn rm-btn-primary" disabled={busy}>{busy ? tr("Posting…") : tr("Post Comment")}</button>
          </form>
        </div>) : (<p className="text-sm text-gray-500 border-t border-gray-200 pt-6">{tr("Comments are closed.")}</p>)}
    </section>);
}
