import { getSettings } from "@/lib/options";
import { getMenuByLocation } from "@/lib/menus";
import { resolveActiveTheme } from "@/lib/theme/resolve";
import ThemeHeader from "@/components/site/theme/ThemeHeader";
import ThemeFooter from "@/components/site/theme/ThemeFooter";
import { ThemeStyles, themeScopeClass, themeStyleObject } from "@/components/site/theme/ThemeStyles";
import { StoreProvider } from "@/components/shop/StoreContext";
export const dynamic = "force-dynamic";
export default async function ShopLayout({ children }: {
    children: React.ReactNode;
}) {
    const settings = (await getSettings());
    const { theme } = await resolveActiveTheme(settings.theme);
    const menu = (await getMenuByLocation("primary"));
    return (<div className={`${themeScopeClass(theme)} min-h-screen flex flex-col shop-scope`} style={themeStyleObject(theme)}>
      <ThemeStyles />
      <ThemeHeader settings={settings} theme={theme} menu={menu}/>
      <StoreProvider>
        <main className="noma-store-content flex-1 w-full max-w-6xl mx-auto px-5 py-10">{children}</main>
      </StoreProvider>
      <ThemeFooter settings={settings} theme={theme}/>
    </div>);
}
