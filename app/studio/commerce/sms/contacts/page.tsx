import ShopSmsContacts from "@/components/shop/admin/ShopSmsContacts";
import { SmsHeader } from "@/components/shop/admin/SmsHeader";
export const dynamic = "force-dynamic";
export default function Page() {
    return (<>
      <SmsHeader tab="contacts"/>
      <ShopSmsContacts />
    </>);
}
