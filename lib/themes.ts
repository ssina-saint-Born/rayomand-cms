import { BUILTIN_SPECS } from "./theme/builtin";
import { specToThemeDef } from "./theme/spec";

export interface ThemeDef {
  slug: string;
  name: string;
  description: string;
  bg: string;
  text: string;
  accent: string;
  headerBg: string;
  headerText: string;
  font: string;
}

// Kept for callers that only need palette values synchronously. The active
// theme is resolved by lib/theme/resolve.ts, which also understands uploaded
// declarative packs and coded themes.
export const THEMES: ThemeDef[] = BUILTIN_SPECS.map(specToThemeDef);

export function getTheme(slug: string): ThemeDef {
  return THEMES.find((t) => t.slug === slug) || THEMES[0];
}
