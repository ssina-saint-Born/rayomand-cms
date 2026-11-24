import { getSettings } from "@/lib/options";
import { getMenuByLocation } from "@/lib/menus";
import { resolveActiveTheme } from "@/lib/theme/resolve";
import ThemeHeader from "@/components/site/theme/ThemeHeader";
import ThemeFooter from "@/components/site/theme/ThemeFooter";
import { ThemeStyles, themeScopeClass, themeStyleObject } from "@/components/site/theme/ThemeStyles";
import { MagazineShell } from "@/components/site/theme/CodedShells";
export const dynamic = "force-dynamic";
export default async function SiteLayout({ children }: {
    children: React.ReactNode;
}) {
    const settings = (await getSettings());
    const { theme, shell } = await resolveActiveTheme(settings.theme);
    const menu = (await getMenuByLocation("primary"));

    // Route 2: a coded theme renders its own shell. Everything else uses the
    // declarative header/main/footer frame below.
    if (shell === "magazine") {
        return (<div className={themeScopeClass(theme)} style={themeStyleObject(theme)}>
          <ThemeStyles />
          <MagazineShell theme={theme} settings={settings} menu={menu}>{children}</MagazineShell>
        </div>);
    }

    return (<div className={`${themeScopeClass(theme)} min-h-screen flex flex-col`} style={themeStyleObject(theme)}>
      <ThemeStyles />
      <ThemeHeader settings={settings} theme={theme} menu={menu}/>
      <main className={`rm-theme-main flex-1${theme.layout.contentWidth === "wide" ? " rm-theme-main-wide" : ""}`}>{children}</main>
      <ThemeFooter settings={settings} theme={theme}/>
    </div>);
}
