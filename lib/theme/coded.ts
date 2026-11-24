import type { ThemeDef } from "@/lib/themes";

// Route 2 — coded themes. Register a slug here to make a developer-authored
// shell available in Appearance → Themes. The shell component receives the
// active theme tokens plus the site header/footer context and renders the
// whole page frame; see components/site/theme/CodedShells.tsx.
//
// A coded theme may be free or premium. A premium coded theme lists a
// `product` and is locked until a matching serial is activated.

export interface CodedTheme extends ThemeDef {
    shell: "magazine";
    license?: "free" | "premium";
    product?: string;
}

export const CODED_THEMES: Record<string, CodedTheme> = {
    // A worked example that ships with the CMS so the mechanism is testable.
    "magazine": {
        slug: "magazine",
        name: "Magazine (coded)",
        description: "A developer-authored editorial shell: wide masthead, accent rule and a compact footer.",
        bg: "#fbfaf7",
        text: "#20201d",
        accent: "#b23a2e",
        headerBg: "#ffffff",
        headerText: "#20201d",
        font: "serif",
        shell: "magazine",
        license: "free",
    },
};
