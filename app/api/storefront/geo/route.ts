import { ok } from "@/lib/api";
import { listProvinces, citiesOfProvince } from "@/lib/shop/geo";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/storefront/geo            -> all provinces (code, name, city count)
// GET /api/storefront/geo?state=THR  -> cities of one province
export async function GET(req: Request) {
  const state = new URL(req.url).searchParams.get("state");
  if (state) {
    return ok({ province: state, cities: citiesOfProvince(state) });
  }
  return ok({ provinces: listProvinces() });
}
