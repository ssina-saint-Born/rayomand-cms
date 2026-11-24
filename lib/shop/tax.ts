import { getDb, now, withTransaction } from "../db";
import { round2 } from "./core";
import { normalizeProvinceCode } from "./geo";

export interface TaxClass {
  id: number;
  name: string;
  slug: string;
}
export interface TaxRate {
  id: number;
  tax_class: string;
  country: string;
  state: string;
  postcode: string;
  city: string;
  rate: number;
  name: string;
  priority: number;
  compound: number;
  shipping: number;
}
export interface Destination {
  country?: string;
  state?: string;
  city?: string;
  postcode?: string;
}

// ---- Classes ----
export async function listTaxClasses(): Promise<TaxClass[]> {
  return getDb().many("SELECT * FROM tax_classes ORDER BY name ASC");
}

function slugify(name: string): string {
  return String(name).trim().toLowerCase().replace(/[^a-z0-9\u0600-\u06FF]+/g, "-").replace(/^-+|-+$/g, "");
}

export async function saveTaxClass(input: { id?: number; name: string }): Promise<TaxClass> {
  return withTransaction(async () => {
    const db = getDb();
    const name = String(input.name || "").trim();
    if (!name) throw new Error("Tax class name is required.");
    if (input.id) {
      await db.execute("UPDATE tax_classes SET name=$1 WHERE id=$2", name, input.id);
      return db.one("SELECT * FROM tax_classes WHERE id=$1", input.id);
    }
    let slug = slugify(name) || `tax-${Date.now()}`;
    const clash = await db.one("SELECT id FROM tax_classes WHERE slug=$1", slug);
    if (clash) slug = `${slug}-${Date.now().toString(36)}`;
    const r = await db.execute("INSERT INTO tax_classes (name,slug,created_at) VALUES ($1,$2,$3) RETURNING id", name, slug, now());
    return db.one("SELECT * FROM tax_classes WHERE id=$1", Number(r.id));
  });
}

export async function deleteTaxClass(id: number) {
  await withTransaction(async () => {
    const db = getDb();
    const cls = await db.one("SELECT slug FROM tax_classes WHERE id=$1", id);
    if (!cls) return;
    // "standard" is the implicit default class (empty slug) and cannot be removed.
    await db.execute("UPDATE products SET tax_class='' WHERE tax_class=$1", cls.slug);
    await db.execute("DELETE FROM tax_rates WHERE tax_class=$1", cls.slug);
    await db.execute("DELETE FROM tax_classes WHERE id=$1", id);
  });
}

// ---- Rates ----
export async function listTaxRates(): Promise<TaxRate[]> {
  return (await getDb().many("SELECT * FROM tax_rates ORDER BY tax_class, priority, id")).map((r: any) => ({
    ...r, rate: Number(r.rate), priority: Number(r.priority), compound: Number(r.compound), shipping: Number(r.shipping),
  }));
}

export async function saveTaxRate(input: Partial<TaxRate>): Promise<TaxRate> {
  return withTransaction(async () => {
    const db = getDb();
    const v = {
      tax_class: String(input.tax_class ?? ""),
      country: String(input.country ?? "").toUpperCase(),
      state: input.state ? (String(input.country ?? "").toUpperCase() === "IR" ? normalizeProvinceCode(String(input.state)) : String(input.state).toUpperCase()) : "",
      postcode: String(input.postcode ?? ""),
      city: String(input.city ?? ""),
      rate: Number(input.rate ?? 0),
      name: String(input.name ?? ""),
      priority: Math.max(1, Number(input.priority ?? 1)),
      compound: input.compound ? 1 : 0,
      shipping: input.shipping === 0 ? 0 : 1,
    };
    if (!Number.isFinite(v.rate) || v.rate < 0) throw new Error("Tax rate must be a non-negative number.");
    if (input.id) {
      await db.execute(
        "UPDATE tax_rates SET tax_class=$1,country=$2,state=$3,postcode=$4,city=$5,rate=$6,name=$7,priority=$8,compound=$9,shipping=$10 WHERE id=$11",
        v.tax_class, v.country, v.state, v.postcode, v.city, v.rate, v.name, v.priority, v.compound, v.shipping, input.id,
      );
      return (await listTaxRates()).find((r) => r.id === Number(input.id))!;
    }
    const r = await db.execute(
      "INSERT INTO tax_rates (tax_class,country,state,postcode,city,rate,name,priority,compound,shipping,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id",
      v.tax_class, v.country, v.state, v.postcode, v.city, v.rate, v.name, v.priority, v.compound, v.shipping, now(),
    );
    return (await listTaxRates()).find((x) => x.id === Number(r.id))!;
  });
}

export async function deleteTaxRate(id: number) {
  await getDb().execute("DELETE FROM tax_rates WHERE id=$1", id);
}

// Resolve the tax rates that apply to a tax class at a destination, grouped by
// priority. Within each priority tier the rates are applied together; higher
// tiers apply on top of the previous ones when marked compound (WC behavior).
export async function matchingTaxRates(taxClass: string, dest: Destination): Promise<TaxRate[]> {
  const country = String(dest.country || "").toUpperCase();
  const state = country === "IR" ? normalizeProvinceCode(String(dest.state || "")) : String(dest.state || "").toUpperCase();
  const postcode = String(dest.postcode || "").replace(/\s+/g, "").toUpperCase();
  const city = String(dest.city || "").trim();
  const all = await listTaxRates();
  return all.filter((r) => {
    if ((r.tax_class || "") !== (taxClass || "")) return false;
    if (r.country && r.country !== country) return false;
    if (r.state && r.state !== state) return false;
    if (r.city && r.city !== city) return false;
    if (r.postcode && r.postcode !== postcode) return false;
    return true;
  });
}

export interface TaxLine {
  name: string;
  rate: number;
  amount: number;
}

// Compute tax for a taxable amount. Returns the tax amount and a per-rate breakdown.
export function computeTaxFor(amount: number, rates: TaxRate[], priceIncludesTax: boolean): { tax: number; lines: TaxLine[] } {
  if (!rates.length || amount <= 0) return { tax: 0, lines: [] };
  const tiers = new Map<number, TaxRate[]>();
  for (const r of rates) {
    const list = tiers.get(r.priority) || [];
    list.push(r);
    tiers.set(r.priority, list);
  }
  const priorities = Array.from(tiers.keys()).sort((a, b) => a - b);

  // Running base grows with compound rates applied in earlier tiers.
  let running = amount;
  const lines: TaxLine[] = [];
  for (const p of priorities) {
    const tier = tiers.get(p)!;
    // Sum of all rates applied at this tier (WC applies the tier total once).
    const tierPct = tier.reduce((a, r) => a + r.rate, 0);
    let tax;
    if (priceIncludesTax) {
      const base = running;
      const gross = (base * tierPct) / (100 + tierPct);
      tax = gross;
      for (const r of tier) {
        const share = tierPct ? (r.rate / tierPct) * gross : 0;
        lines.push({ name: r.name || "Tax", rate: r.rate, amount: round2(share) });
      }
    } else {
      tax = (running * tierPct) / 100;
      for (const r of tier) {
        lines.push({ name: r.name || "Tax", rate: r.rate, amount: round2((running * r.rate) / 100) });
      }
    }
    // Compound rates build on the taxed amount; non-compound stay on the original base.
    const compound = tier.some((r) => r.compound);
    if (compound) running += tax;
  }
  return { tax: round2(lines.reduce((a, l) => a + l.amount, 0)), lines };
}

// Tax applicable to the shipping charge, using the rates flagged "shipping".
export function shippingTaxFor(shipping: number, rates: TaxRate[], priceIncludesTax: boolean): { tax: number; lines: TaxLine[] } {
  if (!shipping || !rates.length) return { tax: 0, lines: [] };
  return computeTaxFor(shipping, rates.filter((r) => r.shipping), priceIncludesTax);
}
