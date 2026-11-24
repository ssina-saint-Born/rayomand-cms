export type FieldTypeId =
  | "text" | "textarea" | "integer" | "decimal" | "boolean"
  | "email" | "url" | "datetime" | "entity_reference" | "media_reference";

export interface FieldTypeDef {
  id: FieldTypeId;
  label: string;
  defaultSettings: Record<string, unknown>;
  multiple: boolean;
  mainProperty: string;
}

export const FIELD_TYPES: FieldTypeDef[] = [
  { id: "text", label: "Short text", defaultSettings: { max_length: 255 }, multiple: true, mainProperty: "value" },
  { id: "textarea", label: "Long text", defaultSettings: { max_length: 0 }, multiple: true, mainProperty: "value" },
  { id: "integer", label: "Integer", defaultSettings: { min: null, max: null }, multiple: true, mainProperty: "value" },
  { id: "decimal", label: "Decimal", defaultSettings: { min: null, max: null, scale: 2 }, multiple: true, mainProperty: "value" },
  { id: "boolean", label: "Boolean", defaultSettings: {}, multiple: false, mainProperty: "value" },
  { id: "email", label: "Email", defaultSettings: {}, multiple: true, mainProperty: "value" },
  { id: "url", label: "URL", defaultSettings: {}, multiple: true, mainProperty: "value" },
  { id: "datetime", label: "Date/time", defaultSettings: {}, multiple: true, mainProperty: "value" },
  { id: "entity_reference", label: "Entity reference", defaultSettings: { target: "posts" }, multiple: true, mainProperty: "target_id" },
  { id: "media_reference", label: "Media reference", defaultSettings: {}, multiple: true, mainProperty: "target_id" },
];

export function fieldTypeDef(id: string): FieldTypeDef {
  return FIELD_TYPES.find((t) => t.id === id) || FIELD_TYPES[0];
}

export function isMultipleField(cardinality: number): boolean {
  return cardinality === -1 || cardinality > 1;
}

// Validate a single field value for a type. Returns null when valid, else an
// English message key that the UI translates (user content is never translated).
export function validateFieldValue(type: string, value: unknown, settings: Record<string, unknown>, required: boolean): string | null {
  if (value === null || value === undefined || value === "") {
    return required ? "This field is required." : null;
  }
  switch (type) {
    case "integer": {
      const n = Number(value);
      if (!Number.isInteger(n)) return "Enter a whole number.";
      const min = settings.min != null ? Number(settings.min) : null;
      const max = settings.max != null ? Number(settings.max) : null;
      if (min != null && n < min) return "Value is below the minimum.";
      if (max != null && n > max) return "Value is above the maximum.";
      return null;
    }
    case "decimal": {
      const n = Number(value);
      if (!Number.isFinite(n)) return "Enter a number.";
      return null;
    }
    case "boolean":
      return null;
    case "email": {
      if (typeof value !== "string") return "Enter a valid email address.";
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? null : "Enter a valid email address.";
    }
    case "url": {
      if (typeof value !== "string" || !/^https?:\/\//i.test(value)) return "Enter a valid absolute URL.";
      return null;
    }
    case "datetime": {
      if (typeof value !== "string" || Number.isNaN(Date.parse(value))) return "Enter a valid date.";
      return null;
    }
    case "text":
    case "textarea": {
      const max = settings.max_length ? Number(settings.max_length) : 0;
      if (typeof value === "string" && max > 0 && value.length > max) return "The value is too long.";
      return null;
    }
    case "entity_reference":
    case "media_reference": {
      const id = typeof value === "object" && value !== null ? (value as { target_id?: unknown }).target_id : value;
      if (typeof id !== "number" || !Number.isInteger(id) || id <= 0) return "Choose a referenced item.";
      return null;
    }
    default:
      return null;
  }
}

// Normalize a raw widget value into the persisted value object shape.
export function toValueObject(type: string, raw: unknown): Record<string, unknown> {
  const def = fieldTypeDef(type);
  if (def.mainProperty === "target_id") {
    if (raw === null || raw === undefined || raw === "") return {};
    const id = typeof raw === "object" ? (raw as { target_id?: unknown }).target_id : raw;
    const label = typeof raw === "object" ? (raw as { label?: unknown }).label : undefined;
    const obj: Record<string, unknown> = { target_id: Number(id) };
    if (label != null && label !== "") obj.label = String(label);
    return obj;
  }
  return { value: raw };
}