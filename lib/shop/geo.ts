import raw from "./iran-geo.json";

export interface GeoCity {
  name: string;
  code: string;
}
export interface GeoProvince {
  code: string;
  name: string;
  cities: GeoCity[];
}

// Iran's administrative divisions, ported from the Persian Commerce
// address module (province codes match Commerce's `IR:XX` state codes).
const provinces: GeoProvince[] = raw.provinces.map((p) => ({
  code: p.code,
  name: p.name,
  cities: p.cities.map(([name, code]) => ({ name, code })),
}));

const provinceByCode = new Map(provinces.map((p) => [p.code.toUpperCase(), p]));
const provinceByName = new Map(provinces.map((p) => [p.name, p]));

export function listProvinces(): { code: string; name: string; cityCount: number }[] {
  return provinces.map((p) => ({ code: p.code, name: p.name, cityCount: p.cities.length }));
}

export function getProvince(codeOrName: string): GeoProvince | null {
  if (!codeOrName) return null;
  const key = String(codeOrName).trim();
  return provinceByCode.get(key.toUpperCase()) || provinceByName.get(key) || null;
}

export function citiesOfProvince(codeOrName: string): GeoCity[] {
  return getProvince(codeOrName)?.cities ?? [];
}

export function findCity(provinceCodeOrName: string, cityCodeOrName: string): GeoCity | null {
  const province = getProvince(provinceCodeOrName);
  if (!province) return null;
  const key = String(cityCodeOrName || "").trim();
  if (!key) return null;
  return (
    province.cities.find((c) => c.code === key) ||
    province.cities.find((c) => c.name === key) ||
    null
  );
}

// Accepts either a province code ("THR") or its Persian name and returns the
// canonical code, so zone locations stay stable regardless of how they were entered.
export function normalizeProvinceCode(value: string): string {
  return getProvince(value)?.code ?? String(value || "").trim().toUpperCase();
}

export function provinceName(codeOrName: string): string {
  return getProvince(codeOrName)?.name ?? String(codeOrName || "");
}
