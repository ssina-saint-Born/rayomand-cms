import ShopSmsSettings from "@/components/shop/admin/ShopSmsSettings";
import { SmsHeader } from "@/components/shop/admin/SmsHeader";
export const dynamic = "force-dynamic";
export default function Page() {
    return (<>
      <SmsHeader tab="settings"/>
      <ShopSmsSettings />
    </>);
}
