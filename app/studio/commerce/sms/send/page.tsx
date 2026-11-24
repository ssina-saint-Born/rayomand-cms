import ShopSmsSend from "@/components/shop/admin/ShopSmsSend";
import { SmsHeader } from "@/components/shop/admin/SmsHeader";
export const dynamic = "force-dynamic";
export default function Page() {
    return (<>
      <SmsHeader tab="send"/>
      <ShopSmsSend />
    </>);
}
