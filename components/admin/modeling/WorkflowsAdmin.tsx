"use client";
import { useEffect, useState, useCallback } from "react";

interface State { id: number; state: string; label: string; published: number; }
interface Transition { id: number; from_state: string; to_state: string; min_role: string; label: string; }
interface Workflow { id: number; machine_name: string; label: string; initial_state: string; states?: State[]; transitions?: Transition[]; }

export default function WorkflowsAdmin() {
  const [items, setItems] = useState<Workflow[]>([]);
  const [label, setLabel] = useState("");
  const [machine, setMachine] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/modeling/workflows");
      const data = await r.json();
      setItems(data.items || data);
    }
    catch { /* ignore */ }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function create() {
    setError("");
    const r = await fetch("/api/modeling/workflows", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ machine_name: machine, label }),
    });
    const data = await r.json();
    if (!r.ok) { setError(data.error || "Failed"); return; }
    setLabel(""); setMachine(""); load();
  }

  async function addState(wf: Workflow, state: string, published: boolean) {
    await fetch(`/api/modeling/workflows/${wf.id}/states`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ state, label: state, published }),
    });
    load();
  }

  return (
    <div className="p-6 max-w-5xl">
      <h1 className="text-xl font-bold mb-4">Workflows</h1>
      <div className="flex gap-2 mb-6 flex-wrap">
        <input className="border rounded px-3 py-2" placeholder="Label" value={label} onChange={(e) => setLabel(e.target.value)} />
        <input className="border rounded px-3 py-2" placeholder="Machine name" value={machine} onChange={(e) => setMachine(e.target.value)} />
        <button className="bg-blue-600 text-white rounded px-4 py-2" onClick={create}>Create</button>
      </div>
      {error && <div className="text-red-600 mb-4">{error}</div>}
      <ul className="space-y-4">
        {items.map((wf) => (
          <li key={wf.id} className="border rounded p-4">
            <div className="font-medium">{wf.label} <span className="text-gray-500 text-sm">({wf.machine_name})</span></div>
            <div className="mt-2 flex gap-2 flex-wrap items-center">
              <span className="text-sm text-gray-600">States:</span>
              {wf.states?.map((s) => (
                <span key={s.id} className={`text-xs px-2 py-1 rounded ${s.published ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-700"}`}>
                  {s.label}
                </span>
              ))}
              <AddStateForm wf={wf} onAdd={addState} />
            </div>
            {!!wf.transitions?.length && (
              <div className="mt-2 text-sm text-gray-500">Transitions: {wf.transitions.map((t) => `${t.from_state} → ${t.to_state} (${t.min_role})`).join(" · ")}</div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function AddStateForm({ wf, onAdd }: { wf: Workflow; onAdd: (wf: Workflow, state: string, published: boolean) => void }) {
  const [state, setState] = useState("");
  const [published, setPublished] = useState(false);
  return (
    <div className="flex gap-1 items-center ml-2">
      <input className="border rounded px-2 py-1 text-sm w-32" placeholder="state_machine" value={state} onChange={(e) => setState(e.target.value)} />
      <label className="text-xs flex items-center gap-1"><input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} /> published</label>
      <button className="bg-gray-700 text-white rounded px-2 py-1 text-xs" onClick={() => { if (state) { onAdd(wf, state, published); setState(""); setPublished(false); } }}>+State</button>
    </div>
  );
}