"use client";
import { useEffect, useState, useCallback } from "react";

interface ViewRow { id: number; machine_name: string; label: string; base: string; display: string; }

export default function ViewsAdmin() {
  const [items, setItems] = useState<ViewRow[]>([]);
  const [label, setLabel] = useState("");
  const [machine, setMachine] = useState("");
  const [base, setBase] = useState("posts");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/modeling/views");
      const data = await r.json();
      setItems(data.items || data);
    }
    catch { /* ignore */ }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function create() {
    setError("");
    const r = await fetch("/api/modeling/views", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ machine_name: machine, label, base }),
    });
    const data = await r.json();
    if (!r.ok) { setError(data.error || "Failed"); return; }
    setLabel(""); setMachine(""); load();
  }

  async function remove(id: number) {
    await fetch(`/api/modeling/views/${id}`, { method: "DELETE" });
    load();
  }

  async function preview(id: number) {
    const r = await fetch(`/api/modeling/views/${id}/render`);
    const data = await r.json();
    if (!r.ok) { setError(data.error || "Render failed"); return; }
    window.alert(`View rendered\nitems: ${data.items?.length ?? 0}, total: ${data.total}, pages: ${data.pages}`);
  }

  return (
    <div className="p-6 max-w-4xl">
      <h1 className="text-xl font-bold mb-4">Views Builder</h1>
      <div className="flex gap-2 mb-6 flex-wrap">
        <input className="border rounded px-3 py-2" placeholder="Label" value={label} onChange={(e) => setLabel(e.target.value)} />
        <input className="border rounded px-3 py-2" placeholder="Machine name" value={machine} onChange={(e) => setMachine(e.target.value)} />
        <select className="border rounded px-3 py-2" value={base} onChange={(e) => setBase(e.target.value)}>
          <option value="posts">Posts</option>
          <option value="products">Products</option>
          <option value="media">Media</option>
        </select>
        <button className="bg-blue-600 text-white rounded px-4 py-2" onClick={create}>Create</button>
      </div>
      {error && <div className="text-red-600 mb-4">{error}</div>}
      <ul className="space-y-2">
        {items.map((v) => (
          <li key={v.id} className="border rounded p-3 flex items-center justify-between">
            <div>
              <div className="font-medium">{v.label} <span className="text-gray-500 text-sm">({v.machine_name})</span></div>
              <div className="text-sm text-gray-500">base: {v.base} · display: {v.display}</div>
            </div>
            <div className="flex gap-2">
              <button className="bg-gray-700 text-white rounded px-3 py-1 text-sm" onClick={() => preview(v.id)}>Preview</button>
              <button className="text-red-600 text-sm" onClick={() => remove(v.id)}>Delete</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}