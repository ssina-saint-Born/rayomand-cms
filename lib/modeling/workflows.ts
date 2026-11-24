import { getDb, now, withTransaction } from "../db";
import { parseJson } from "../shop/core";

export interface DcWorkflow {
  id: number;
  machine_name: string;
  label: string;
  initial_state: string;
  created_at: string;
  states: DcWorkflowState[];
  transitions: DcWorkflowTransition[];
}
export interface DcWorkflowState {
  id: number;
  workflow_id: number;
  state: string;
  label: string;
  weight: number;
  published: number;
}
export interface DcWorkflowTransition {
  id: number;
  workflow_id: number;
  from_state: string;
  to_state: string;
  label: string;
  weight: number;
  min_role: string;
}

function stateHydrate(row: any): DcWorkflowState {
  return { ...row, weight: Number(row.weight), published: Number(row.published) };
}
function transitionHydrate(row: any): DcWorkflowTransition {
  return { ...row, weight: Number(row.weight) };
}
function workflowHydrate(row: any, states: DcWorkflowState[], transitions: DcWorkflowTransition[]): DcWorkflow {
  return { ...row, states, transitions };
}

export async function getWorkflow(id: number): Promise<DcWorkflow | null> {
  const row = await getDb().one("SELECT * FROM model_workflows WHERE id=$1", id);
  if (!row) return null;
  const states = (await getDb().many("SELECT * FROM model_workflow_states WHERE workflow_id=$1 ORDER BY weight, id", id)).map(stateHydrate);
  const transitions = (await getDb().many("SELECT * FROM model_workflow_transitions WHERE workflow_id=$1 ORDER BY weight, id", id)).map(transitionHydrate);
  return workflowHydrate(row, states, transitions);
}

export async function listWorkflows(): Promise<DcWorkflow[]> {
  const rows = await getDb().many("SELECT * FROM model_workflows ORDER BY id");
  const out: DcWorkflow[] = [];
  for (const r of rows) {
    const states = (await getDb().many("SELECT * FROM model_workflow_states WHERE workflow_id=$1 ORDER BY weight, id", Number(r.id))).map(stateHydrate);
    const transitions = (await getDb().many("SELECT * FROM model_workflow_transitions WHERE workflow_id=$1 ORDER BY weight, id", Number(r.id))).map(transitionHydrate);
    out.push(workflowHydrate(r, states, transitions));
  }
  return out;
}

export async function createWorkflow(input: Record<string, any>): Promise<DcWorkflow> {
  return withTransaction(async () => {
    const db = getDb();
    const machine = String(input.machine_name || "").trim();
    if (!/^[a-z][a-z0-9_]*$/.test(machine)) throw new Error("Use lowercase letters, numbers and underscores.");
    if (!input.label) throw new Error("A label is required.");
    const initial = String(input.initial_state || "draft");
    const r = await db.execute(
      "INSERT INTO model_workflows (machine_name,label,initial_state,created_at) VALUES ($1,$2,$3,$4) RETURNING id",
      machine, String(input.label).trim(), initial, now(),
    );
    const id = Number(r.id);
    // Always seed at least one state so the workflow is valid.
    await db.execute(
      "INSERT INTO model_workflow_states (workflow_id,state,label,weight,published,created_at) VALUES ($1,$2,$3,$4,$5,$6)",
      id, initial, input.label, 0, 0, now(),
    );
    return (await getWorkflow(id))!;
  });
}

export async function updateWorkflow(id: number, input: Record<string, any>): Promise<DcWorkflow> {
  return withTransaction(async () => {
    const existing = await getWorkflow(id);
    if (!existing) throw new Error("Workflow not found.");
    const sets: string[] = [];
    const vals: unknown[] = [];
    const push = (col: string, v: unknown) => { sets.push(`${col}=$${vals.length + 1}`); vals.push(v); };
    if (input.label !== undefined) push("label", String(input.label).trim());
    if (input.initial_state !== undefined) push("initial_state", String(input.initial_state));
    if (!sets.length) return existing;
    vals.push(id);
    await getDb().execute(`UPDATE model_workflows SET ${sets.join(",")} WHERE id=$${vals.length}`, ...vals);
    return (await getWorkflow(id))!;
  });
}

export async function deleteWorkflow(id: number): Promise<void> {
  return withTransaction(async () => {
    const db = getDb();
    await db.execute("DELETE FROM model_workflow_transitions WHERE workflow_id=$1", id);
    await db.execute("DELETE FROM model_workflow_states WHERE workflow_id=$1", id);
    await db.execute("UPDATE model_content_types SET workflow_id=NULL WHERE workflow_id=$1", id);
    await db.execute("DELETE FROM model_workflows WHERE id=$1", id);
  });
}

export async function addState(workflowId: number, input: Record<string, any>): Promise<DcWorkflowState> {
  return withTransaction(async () => {
    const db = getDb();
    const wf = await db.one("SELECT id FROM model_workflows WHERE id=$1", workflowId);
    if (!wf) throw new Error("Workflow not found.");
    const state = String(input.state || "").trim();
    if (!/^[a-z0-9_]+$/.test(state)) throw new Error("Use lowercase letters, numbers and underscores.");
    if (!input.label) throw new Error("A label is required.");
    const r = await db.execute(
      "INSERT INTO model_workflow_states (workflow_id,state,label,weight,published,created_at) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id",
      workflowId, state, String(input.label).trim(), Number(input.weight ?? 0), input.published ? 1 : 0, now(),
    );
    return stateHydrate(await db.one("SELECT * FROM model_workflow_states WHERE id=$1", Number(r.id)));
  });
}

export async function updateState(workflowId: number, stateId: number, input: Record<string, any>): Promise<DcWorkflowState> {
  return withTransaction(async () => {
    const db = getDb();
    const row = await db.one("SELECT * FROM model_workflow_states WHERE id=$1 AND workflow_id=$2", stateId, workflowId);
    if (!row) throw new Error("State not found.");
    const sets: string[] = [];
    const vals: unknown[] = [];
    const push = (col: string, v: unknown) => { sets.push(`${col}=$${vals.length + 1}`); vals.push(v); };
    if (input.label !== undefined) push("label", String(input.label).trim());
    if (input.weight !== undefined) push("weight", Number(input.weight));
    if (input.published !== undefined) push("published", input.published ? 1 : 0);
    if (!sets.length) return stateHydrate(row);
    vals.push(stateId);
    await db.execute(`UPDATE model_workflow_states SET ${sets.join(",")} WHERE id=$${vals.length}`, ...vals);
    return stateHydrate(await db.one("SELECT * FROM model_workflow_states WHERE id=$1", stateId));
  });
}

export async function deleteState(workflowId: number, stateId: number): Promise<void> {
  return withTransaction(async () => {
    const db = getDb();
    const row = await db.one("SELECT * FROM model_workflow_states WHERE id=$1 AND workflow_id=$2", stateId, workflowId);
    if (!row) throw new Error("State not found.");
    await db.execute("DELETE FROM model_workflow_transitions WHERE workflow_id=$1 AND (from_state=$2 OR to_state=$3)", workflowId, String(row.state), String(row.state));
    await db.execute("DELETE FROM model_workflow_states WHERE id=$1", stateId);
  });
}

export async function addTransition(workflowId: number, input: Record<string, any>): Promise<DcWorkflowTransition> {
  return withTransaction(async () => {
    const db = getDb();
    const wf = await db.one("SELECT id FROM model_workflows WHERE id=$1", workflowId);
    if (!wf) throw new Error("Workflow not found.");
    const from = String(input.from_state || "").trim();
    const to = String(input.to_state || "").trim();
    if (!from || !to) throw new Error("Both source and target states are required.");
    if (from === to) throw new Error("A transition must connect two different states.");
    const fromRow = await db.one("SELECT id FROM model_workflow_states WHERE workflow_id=$1 AND state=$2", workflowId, from);
    const toRow = await db.one("SELECT id FROM model_workflow_states WHERE workflow_id=$1 AND state=$2", workflowId, to);
    if (!fromRow || !toRow) throw new Error("Referenced state does not exist in this workflow.");
    const r = await db.execute(
      "INSERT INTO model_workflow_transitions (workflow_id,from_state,to_state,label,weight,min_role,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id",
      workflowId, from, to, String(input.label || `${from} → ${to}`), Number(input.weight ?? 0),
      String(input.min_role || "editor"), now(),
    );
    return transitionHydrate(await db.one("SELECT * FROM model_workflow_transitions WHERE id=$1", Number(r.id)));
  });
}

export async function updateTransition(workflowId: number, transitionId: number, input: Record<string, any>): Promise<DcWorkflowTransition> {
  return withTransaction(async () => {
    const db = getDb();
    const row = await db.one("SELECT * FROM model_workflow_transitions WHERE id=$1 AND workflow_id=$2", transitionId, workflowId);
    if (!row) throw new Error("Transition not found.");
    const sets: string[] = [];
    const vals: unknown[] = [];
    const push = (col: string, v: unknown) => { sets.push(`${col}=$${vals.length + 1}`); vals.push(v); };
    if (input.label !== undefined) push("label", String(input.label).trim());
    if (input.weight !== undefined) push("weight", Number(input.weight));
    if (input.min_role !== undefined) push("min_role", String(input.min_role));
    if (!sets.length) return transitionHydrate(row);
    vals.push(transitionId);
    await db.execute(`UPDATE model_workflow_transitions SET ${sets.join(",")} WHERE id=$${vals.length}`, ...vals);
    return transitionHydrate(await db.one("SELECT * FROM model_workflow_transitions WHERE id=$1", transitionId));
  });
}

export async function deleteTransition(workflowId: number, transitionId: number): Promise<void> {
  return withTransaction(async () => {
    await getDb().execute("DELETE FROM model_workflow_transitions WHERE id=$1 AND workflow_id=$2", transitionId, workflowId);
  });
}

export { parseJson };