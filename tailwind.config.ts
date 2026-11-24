import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        rm: {
          blue: "#45665b", blueHover: "#344f46", dark: "#273c36", darker: "#20322d",
          gray: "#f3f5f1", border: "#dce3dc", text: "#394b44", muted: "#65756d",
          green: "#4c6c57", red: "#975953", yellow: "#806b43",
        },
        shop: {
          purple: "#656080", purpleDark: "#504b69", purpleDeep: "#353149",
          magenta: "#8c6372", amber: "#a58c64", green: "#4c6c57", blue: "#546c83",
          red: "#975953", ink: "#2e3935", bg: "#f5f5f0", surface: "#fdfefb",
          border: "#e1e3da", muted: "#68746d",
        },
        gray: {
          50: "#f8faf7", 100: "#f0f3ee", 200: "#e0e6de", 300: "#cbd4ca",
          400: "#89988d", 500: "#65756d", 600: "#526359", 700: "#394b44",
          800: "#2d3d35", 900: "#20322d",
        },
        blue: { 50: "#eef3f5", 100: "#dfe9ef", 200: "#c5d8e3", 500: "#5f7b8d", 600: "#506c7c", 700: "#405968" },
        green: { 50: "#eef4ed", 100: "#e0ecdd", 200: "#c9dcc8", 500: "#66846a", 600: "#4c6c57", 700: "#405b49" },
        red: { 50: "#faf0ed", 100: "#f1ded9", 200: "#e6c6bd", 500: "#ac756b", 600: "#975953", 700: "#7e4842" },
        yellow: { 50: "#faf6eb", 100: "#f1e8d1", 200: "#e6d6ae", 500: "#a58c64", 600: "#8b744c", 700: "#75603c" },
      },
      borderRadius: { DEFAULT: "12px", sm: "8px", md: "14px", lg: "18px", xl: "24px", "2xl": "30px", "3xl": "38px" },
      boxShadow: {
        sm: "0 2px 8px rgb(39 60 54 / 0.04)", DEFAULT: "0 4px 16px rgb(39 60 54 / 0.06)",
        md: "0 8px 28px rgb(39 60 54 / 0.08)", lg: "0 12px 40px rgb(39 60 54 / 0.1)",
        xl: "0 24px 70px rgb(39 60 54 / 0.12)",
      },
      transitionTimingFunction: { DEFAULT: "cubic-bezier(0.2, 0, 0, 1)" },
      fontFamily: { sans: ["'Segoe UI Variable'", "'Segoe UI'", "-apple-system", "BlinkMacSystemFont", "Roboto", "sans-serif"] },
    },
  },
  plugins: [],
};
export default config;
