import { getDb, now, withTransaction } from "../db";
import { parseJson, round2 } from "./core";
import { normalizeProvinceCode } from "./geo";

export interface ZoneLocation {
  id: number;
  location_type: "country" | "state" | "postcode" | "city";
  location_code: string;
}
export interface ZoneMethod {
  id: number;
  zone_id: number;
  method_type: "flat_rate" | "free_shipping" | "local_pickup";
  title: string;
  enabled: number;
  settings: Record<string, any>;
  method_order: number;
}
export interface ShippingZone {
  id: number;
  name: string;
  zone_order: number;
  locations: ZoneLocation[];
  methods: ZoneMethod[];
}
export interface ShippingClass {
  id: number;
  name: string;
  slug: string;
  description: string;
}
export interface Destination {
  country?: string;
  state?: string;
  city?: string;
  postcode?: string;
}

export interface PackageLine {
  product_id: number;
  quantity: number;
  line_total: number;
  shipping_class: string;
  weight: number;
  needs_shipping: boolean;
}

export interface ShippingRate {
  method_id: number;
  zone_id: number;
  zone_name: string;
  method_type: string;
  label: string;
  cost: number;
}

// ---- Classes ----
export async function listShippingClasses(): Promise<ShippingClass[]> {
  return getDb().many("SELECT * FROM shipping_classes ORDER BY name ASC");
}

function slugifyClass(name: string): string {
  return String(name).trim().toLowerCase().replace(/[^a-z0-9\u0600-\u06FF]+/g, "-").replace(/^-+|-+$/g, "");
}

export async function saveShippingClass(input: { id?: number; name: string; description?: string }): Promise<ShippingClass> {
  return withTransaction(async () => {
    const db = getDb();
    const name = String(input.name || "").trim();
    if (!name) throw new Error("Shipping class name is required.");
    if (input.id) {
      await db.execute("UPDATE shipping_classes SET name=$1, description=$2 WHERE id=$3", name, String(input.description ?? ""), input.id);
      return db.one("SELECT * FROM shipping_classes WHERE id=$1", input.id);
    }
    let slug = slugifyClass(name) || `class-${Date.now()}`;
    const clash = await db.one("SELECT id FROM shipping_classes WHERE slug=$1", slug);
    if (clash) slug = `${slug}-${Date.now().toString(36)}`;
    const r = await db.execute(
      "INSERT INTO shipping_classes (name,slug,description,created_at) VALUES ($1,$2,$3,$4) RETURNING id",
      name, slug, String(input.description ?? ""), now(),
    );
    return db.one("SELECT * FROM shipping_classes WHERE id=$1", Number(r.id));
  });
}

export async function deleteShippingClass(id: number) {
  await withTransaction(async () => {
    const db = getDb();
    const cls = await db.one("SELECT slug FROM shipping_classes WHERE id=$1", id);
    if (!cls) return;
    // Detach products so a deleted class never leaves them pointing at nothing.
    await db.execute("UPDATE products SET shipping_class='' WHERE shipping_class=$1", cls.slug);
    await db.execute("DELETE FROM shipping_classes WHERE id=$1", id);
  });
}

// ---- Zones ----
function hydrateZone(row: any, locations: ZoneLocation[], methods: ZoneMethod[]): ShippingZone {
  return {
    id: Number(row.id),
    name: row.name,
    zone_order: Number(row.zone_order),
    locations,
    methods: methods.map((m) => ({ ...m, settings: parseJson(m.settings, {}) })),
  };
}

export async function listZones(): Promise<ShippingZone[]> {
  const db = getDb();
  const zones = await db.many("SELECT * FROM shipping_zones ORDER BY zone_order ASC, id ASC");
  if (!zones.length) return [];
  const ids = zones.map((z: any) => Number(z.id));
  const locations = await db.many("SELECT * FROM shipping_zone_locations WHERE zone_id = ANY($1) ORDER BY id", ids);
  const methods = await db.many("SELECT * FROM shipping_zone_methods WHERE zone_id = ANY($1) ORDER BY method_order, id", ids);
  return zones.map((z: any) =>
    hydrateZone(
      z,
      locations.filter((l: any) => Number(l.zone_id) === Number(z.id)),
      methods.filter((m: any) => Number(m.zone_id) === Number(z.id)),
    ),
  );
}

export async function getZone(id: number): Promise<ShippingZone | null> {
  const db = getDb();
  const row = await db.one("SELECT * FROM shipping_zones WHERE id=$1", id);
  if (!row) return null;
  const locations = await db.many("SELECT * FROM shipping_zone_locations WHERE zone_id=$1 ORDER BY id", id);
  const methods = await db.many("SELECT * FROM shipping_zone_methods WHERE zone_id=$1 ORDER BY method_order, id", id);
  return hydrateZone(row, locations, methods);
}

export async function saveZone(input: { id?: number; name: string; zone_order?: number; locations?: { location_type: string; location_code: string }[]; methods?: Partial<ZoneMethod>[] }): Promise<ShippingZone> {
  return withTransaction(async () => {
    const db = getDb();
    const name = String(input.name || "").trim();
    if (!name) throw new Error("Zone name is required.");
    const t = now();
    let id = Number(input.id || 0);
    if (id) {
      await db.execute("UPDATE shipping_zones SET name=$1, zone_order=$2, updated_at=$3 WHERE id=$4", name, Number(input.zone_order ?? 0), t, id);
    } else {
      const r = await db.execute("INSERT INTO shipping_zones (name,zone_order,created_at,updated_at) VALUES ($1,$2,$3,$4) RETURNING id", name, Number(input.zone_order ?? 0), t, t);
      id = Number(r.id);
    }
    if (input.locations) {
      await db.execute("DELETE FROM shipping_zone_locations WHERE zone_id=$1", id);
      for (const loc of input.locations) {
        if (!loc.location_code) continue;
        const code = loc.location_type === "state" ? `IR:${normalizeProvinceCode(loc.location_code)}` : String(loc.location_code).trim();
        await db.execute("INSERT INTO shipping_zone_locations (zone_id,location_type,location_code) VALUES ($1,$2,$3)", id, loc.location_type, code);
      }
    }
    if (input.methods) {
      await db.execute("DELETE FROM shipping_zone_methods WHERE zone_id=$1", id);
      let order = 0;
      for (const m of input.methods) {
        await db.execute(
          "INSERT INTO shipping_zone_methods (zone_id,method_type,title,enabled,settings,method_order) VALUES ($1,$2,$3,$4,$5,$6)",
          id, m.method_type || "flat_rate", String(m.title ?? ""), m.enabled === 0 ? 0 : 1, JSON.stringify(m.settings ?? {}), order++,
        );
      }
    }
    return (await getZone(id))!;
  });
}

export async function deleteZone(id: number) {
  await withTransaction(async () => {
    const db = getDb();
    await db.execute("DELETE FROM shipping_zone_locations WHERE zone_id=$1", id);
    await db.execute("DELETE FROM shipping_zone_methods WHERE zone_id=$1", id);
    await db.execute("DELETE FROM shipping_zones WHERE id=$1", id);
  });
}

// ---- Zone matching (mirrors WC_Shipping_Zones::get_zone_matching_package) ----
// A zone matches when the destination country, or its country:state, appears in
// the zone's locations. When several zones match, the lowest zone_order wins.
export async function findMatchingZone(dest: Destination): Promise<ShippingZone | null> {
  const country = String(dest.country || "").trim().toUpperCase();
  const state = country === "IR" ? normalizeProvinceCode(String(dest.state || "")) : String(dest.state || "").trim().toUpperCase();
  const city = String(dest.city || "").trim();
  const zones = await listZones();
  for (const zone of zones) {
    if (!zone.locations.length) continue;
    for (const loc of zone.locations) {
      const code = String(loc.location_code || "").toUpperCase();
      if (loc.location_type === "country" && code === country) return zone;
      if (loc.location_type === "state" && code === `${country}:${state}`) return zone;
      if (loc.location_type === "city" && city && code.split(":").pop() === city) return zone;
      if (loc.location_type === "postcode" && dest.postcode) {
        if (postcodeMatches(String(dest.postcode), loc.location_code)) return zone;
      }
    }
  }
  return null;
}

// WC postcode location matcher: supports "12345", "123*" and "1000...2000" ranges.
function postcodeMatches(postcode: string, rule: string): boolean {
  const p = postcode.replace(/\s+/g, "").toUpperCase();
  const r = String(rule).replace(/\s+/g, "").toUpperCase();
  if (!r) return false;
  if (r.includes("...")) {
    const [lo, hi] = r.split("...");
    return p >= lo && p <= (hi || lo);
  }
  if (r.endsWith("*")) return p.startsWith(r.slice(0, -1));
  return p === r;
}

// ---- Flat rate cost evaluation (mirrors WC_Shipping_Flat_Rate::evaluate_cost) ----
// Supports [qty], [cost], arithmetic, and the [fee percent="" min_fee="" max_fee=""] shortcode.
export function evaluateCost(expr: string, args: { qty: number; cost: number }): number {
  if (expr == null || String(expr).trim() === "") return 0;
  let s = String(expr);
  s = s.replace(/\[fee\s*([^\]]*)\]/gi, (_m, attrs: string) => {
    const get = (k: string) => {
      const mm = new RegExp(`${k}\\s*=\\s*["']?([0-9.]+)`, "i").exec(attrs || "");
      return mm ? Number(mm[1]) : 0;
    };
    let fee = 0;
    const percent = get("percent");
    if (percent) fee = args.cost * (percent / 100);
    const minFee = get("min_fee");
    if (minFee && fee < minFee) fee = minFee;
    const maxFee = get("max_fee");
    if (maxFee && fee > maxFee) fee = maxFee;
    return String(fee);
  });
  s = s.replace(/\[qty\]/gi, String(args.qty)).replace(/\[cost\]/gi, String(args.cost));
  s = s.replace(/\s+/g, "").replace(/,/g, ".");
  s = s.replace(/^[\t\n\r\0\x0B+*/]+|[\t\n\r\0\x0B+\-*/]+$/g, "");
  if (!s) return 0;
  const value = safeArithmetic(s);
  return Number.isFinite(value) ? value : 0;
}

// Tiny arithmetic evaluator (shunting-yard) so shipping formulas never touch eval().
function safeArithmetic(input: string): number {
  const tokens = input.match(/(\d+(?:\.\d+)?|[()+\-*/])/g);
  if (!tokens || tokens.join("") !== input) return 0;
  const prec: Record<string, number> = { "+": 1, "-": 1, "*": 2, "/": 2 };
  const out: number[] = [];
  const ops: string[] = [];
  const apply = () => {
    const op = ops.pop();
    const b = out.pop();
    const a = out.pop();
    if (a == null || b == null || op == null) return;
    out.push(op === "+" ? a + b : op === "-" ? a - b : op === "*" ? a * b : b === 0 ? 0 : a / b);
  };
  for (let i = 0; i < tokens.length; i++) {
    const tk = tokens[i];
    if (/^\d/.test(tk)) out.push(Number(tk));
    else if (tk === "(") ops.push(tk);
    else if (tk === ")") {
      while (ops.length && ops[ops.length - 1] !== "(") apply();
      ops.pop();
    } else {
      // Unary minus at the start or right after an operator.
      if (tk === "-" && (i === 0 || /[(*/+\-]/.test(tokens[i - 1]))) {
        const next = tokens[i + 1];
        if (next && /^\d/.test(next)) { out.push(-Number(next)); i++; continue; }
      }
      while (ops.length && prec[ops[ops.length - 1]] >= prec[tk]) apply();
      ops.push(tk);
    }
  }
  while (ops.length) apply();
  return out[0] ?? 0;
}

function methodLabel(m: ZoneMethod, settings: Record<string, any>): string {
  if (m.title) return m.title;
  if (m.method_type === "local_pickup") return "Local pickup";
  if (m.method_type === "free_shipping") return "Free shipping";
  return "Flat rate";
}

// Compute every shipping option available for a package + destination.
// Mirrors WC flat rate: base cost, plus shipping-class costs either added per
// class ("class" type) or only the highest class cost ("order" type).
export async function availableShippingRates(dest: Destination, lines: PackageLine[], subtotal: number): Promise<ShippingRate[]> {
  const needsShipping = lines.some((l) => l.needs_shipping);
  if (!needsShipping) return [];

  const qty = lines.filter((l) => l.needs_shipping).reduce((a, l) => a + l.quantity, 0);
  const contentsCost = lines.filter((l) => l.needs_shipping).reduce((a, l) => a + l.line_total, 0);

  const zone = await findMatchingZone(dest);
  if (!zone) return [];

  const classes = await listShippingClasses();
  const classBySlug = new Map(classes.map((c) => [c.slug, c]));
  const rates: ShippingRate[] = [];

  for (const m of zone.methods) {
    if (!m.enabled) continue;
    const settings = m.settings || {};

    if (m.method_type === "local_pickup") {
      const cost = evaluateCost(String(settings.cost ?? ""), { qty, cost: contentsCost });
      rates.push({ method_id: m.id, zone_id: zone.id, zone_name: zone.name, method_type: m.method_type, label: methodLabel(m, settings), cost: round2(cost) });
      continue;
    }

    if (m.method_type === "free_shipping") {
      const requires = settings.requires === "min_amount" ? Number(settings.min_amount || 0) : 0;
      const couponFree = settings.requires === "coupon" && !!settings.applied_coupon;
      // "either" needs only one condition; "both" needs both.
      const minOk = !requires || contentsCost >= requires;
      const cond = settings.requires === "min_amount" ? minOk : settings.requires === "coupon" ? couponFree : true;
      if (settings.requires === "both" ? minOk && couponFree : cond) {
        rates.push({ method_id: m.id, zone_id: zone.id, zone_name: zone.name, method_type: m.method_type, label: methodLabel(m, settings), cost: 0 });
      }
      continue;
    }

    // Flat rate
    const type = settings.type === "class" ? "class" : "order";
    let base = evaluateCost(String(settings.cost ?? ""), { qty, cost: contentsCost });
    let hasCosts = String(settings.cost ?? "") !== "";

    const perClass = new Map<string, { qty: number; total: number }>();
    for (const l of lines) {
      if (!l.needs_shipping) continue;
      const key = l.shipping_class || "";
      const cur = perClass.get(key) || { qty: 0, total: 0 };
      cur.qty += l.quantity;
      cur.total += l.line_total;
      perClass.set(key, cur);
    }

    let highestClassCost = 0;
    for (const [slug, agg] of Array.from(perClass.entries())) {
      const key = slug || "no_class";
      const classCostExpr = slug
        ? String(settings[`class_cost_${slug}`] ?? settings[`class_cost_${classBySlug.get(slug)?.id ?? ""}`] ?? "")
        : String(settings.class_cost_no_class ?? settings.no_class_cost ?? "");
      if (classCostExpr === "") continue;
      hasCosts = true;
      const classCost = evaluateCost(classCostExpr, { qty: agg.qty, cost: agg.total });
      if (type === "class") base += classCost;
      else highestClassCost = Math.max(highestClassCost, classCost);
    }
    if (type === "order" && highestClassCost) base += highestClassCost;

    if (hasCosts) {
      rates.push({ method_id: m.id, zone_id: zone.id, zone_name: zone.name, method_type: m.method_type, label: methodLabel(m, settings), cost: round2(base) });
    }
  }

  return rates;
}
