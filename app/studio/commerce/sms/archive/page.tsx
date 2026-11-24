import ShopSmsArchive from "@/components/shop/admin/ShopSmsArchive";
import { SmsHeader } from "@/components/shop/admin/SmsHeader";
export const dynamic = "force-dynamic";
export default function Page() {
    return (<>
      <SmsHeader tab="archive"/>
      <ShopSmsArchive />
    </>);
}
