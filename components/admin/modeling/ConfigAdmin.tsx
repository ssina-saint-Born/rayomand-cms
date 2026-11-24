"use client";
import { useEffect, useState, useCallback } from "react";

interface Snapshot { id: number; label: string; created_at: string; }

export default function ConfigAdmin() {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [label, setLabel] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/modeling/config/snapshots");
      const data = await r.json();
      setSnapshots(data.items || data || []);
    }
    catch { /* ignore */ }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function exportSnap() {
    setError("");
    const r = await fetch("/api/modeling/config/snapshots", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ label: label || "snapshot" }),
    });
    const data = await r.json();
    if (!r.ok) { setError(data.error || "Failed"); return; }
    setLabel(""); load();
  }

  async function compare(id: number) {
    const r = await fetch(`/api/modeling/config/snapshots/${id}/compare`, { method: "POST" });
    const data = await r.json();
    const c = data.current || data;
    const summary = `created: ${(c.created || []).length}, updated: ${(c.updated || []).length}, deleted: ${(c.deleted || []).length}`;
    window.alert(`Config diff\n\n${summary}`);
  }

  async function applyImport(id: number) {
    const r = await fetch(`/api/modeling/config/snapshots/${id}/import`, { method: "POST" });
    const data = await r.json();
    if (!r.ok) { setError(data.error || "Import failed"); return; }
    const a = data.applied || {};
    window.alert(`Imported\ncreated: ${(a.created || []).length}, updated: ${(a.updated || []).length}`);
  }

  async function remove(id: number) {
    await fetch(`/api/modeling/config/snapshots/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="p-6 max-w-4xl">
      <h1 className="text-xl font-bold mb-4">Configuration Snapshots</h1>
      <div className="flex gap-2 mb-6">
        <input className="border rounded px-3 py-2" placeholder="Snapshot label" value={label} onChange={(e) => setLabel(e.target.value)} />
        <button className="bg-blue-600 text-white rounded px-4 py-2" onClick={exportSnap}>Export snapshot</button>
      </div>
      {error && <div className="text-red-600 mb-4">{error}</div>}
      <ul className="space-y-2">
        {snapshots.map((s) => (
          <li key={s.id} className="border rounded p-3 flex items-center justify-between">
            <div>
              <div className="font-medium">{s.label}</div>
              <div className="text-sm text-gray-500">id #{s.id} · {s.created_at}</div>
            </div>
            <div className="flex gap-2">
              <button className="bg-gray-700 text-white rounded px-3 py-1 text-sm" onClick={() => compare(s.id)}>Compare</button>
              <button className="bg-green-700 text-white rounded px-3 py-1 text-sm" onClick={() => applyImport(s.id)}>Import</button>
              <button className="text-red-600 text-sm" onClick={() => remove(s.id)}>Delete</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}