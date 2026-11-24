"use client";
import { useEffect, useState, useCallback } from "react";

interface Field { id: number; machine_name: string; label: string; field_type: string; cardinality: number; required: number; }
interface ContentType { id: number; machine_name: string; label: string; description: string; base_type: string; entity_type: string; workflow_id: number | null; fields?: Field[]; }

export default function ContentTypesAdmin() {
  const [items, setItems] = useState<ContentType[]>([]);
  const [label, setLabel] = useState("");
  const [machine, setMachine] = useState("");
  const [entityType, setEntityType] = useState("custom");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/modeling/content-types");
      const data = await r.json();
      setItems(data.items || data);
    }
    catch { /* ignore */ }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function create() {
    setError("");
    const r = await fetch("/api/modeling/content-types", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ machine_name: machine, label, entity_type: entityType }),
    });
    const data = await r.json();
    if (!r.ok) { setError(data.error || "Failed"); return; }
    setLabel(""); setMachine(""); setEntityType("custom"); load();
  }
  async function remove(id: number) {
    await fetch(`/api/modeling/content-types/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="p-6 max-w-4xl">
      <h1 className="text-xl font-bold mb-4">Content Types</h1>
      <div className="flex gap-2 mb-6 flex-wrap">
        <input className="border rounded px-3 py-2" placeholder="Label" value={label} onChange={(e) => setLabel(e.target.value)} />
        <input className="border rounded px-3 py-2" placeholder="Machine name (lowercase_underscore)" value={machine} onChange={(e) => setMachine(e.target.value)} />
        <select className="border rounded px-3 py-2" value={entityType} onChange={(e) => setEntityType(e.target.value)}>
          <option value="custom">Custom</option>
          <option value="post">Post</option>
          <option value="page">Page</option>
          <option value="product">Product</option>
          <option value="media">Media</option>
        </select>
        <button className="bg-blue-600 text-white rounded px-4 py-2" onClick={create}>Add</button>
      </div>
      {error && <div className="text-red-600 mb-4">{error}</div>}
      <ul className="space-y-3">
        {items.map((ct) => (
          <li key={ct.id} className="border rounded p-4 flex items-center justify-between">
            <div>
              <div className="font-medium">{ct.label} <span className="text-gray-500 text-sm">({ct.machine_name})</span></div>
              <div className="text-sm text-gray-500">entity: {ct.entity_type} · fields: {ct.fields?.length ?? 0}</div>
            </div>
            <button className="text-red-600 text-sm" onClick={() => remove(ct.id)}>Delete</button>
          </li>
        ))}
      </ul>
    </div>
  );
}