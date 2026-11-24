"use client";
import { useEffect, useState, useCallback } from "react";

interface PendingItem { entityTable: string; entityId: number; title: string; state: string; contentTypeId: number | null; }

export default function ModerationAdmin() {
  const [items, setItems] = useState<PendingItem[]>([]);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/modeling/moderation/pending");
      const data = await r.json();
      setItems(data.items || data);
    }
    catch { /* ignore */ }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function viewDetail(item: PendingItem) {
    const r = await fetch(`/api/modeling/moderation/${item.entityTable}/${item.entityId}`);
    if (r.ok) {
      const v = await r.json();
      const labels = v.validTransitions.map((t: any) => t.label).join(", ") || "none";
      window.alert(`Current state: ${v.currentState}\nPublished: ${v.publishedState}\nValid transitions: ${labels}`);
    }
    else {
      const data = await r.json();
      setError(data.error || "Could not load moderation detail");
    }
  }

  return (
    <div className="p-6 max-w-4xl">
      <h1 className="text-xl font-bold mb-4">Moderation Inbox</h1>
      {error && <div className="text-red-600 mb-4">{error}</div>}
      {items.length === 0 ? (
        <p className="text-gray-500">No pending moderation items.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((it) => (
            <li key={`${it.entityTable}-${it.entityId}`} className="border rounded p-3 flex items-center justify-between">
              <div>
                <div className="font-medium">{it.title}</div>
                <div className="text-sm text-gray-500">{it.entityTable} #{it.entityId} · state: {it.state}</div>
              </div>
              <button className="bg-blue-600 text-white rounded px-3 py-1 text-sm" onClick={() => viewDetail(it)}>View</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}