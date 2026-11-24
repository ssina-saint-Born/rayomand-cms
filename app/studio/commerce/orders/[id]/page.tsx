import ShopOrderDetail from "@/components/shop/admin/ShopOrderDetail";
export const dynamic = "force-dynamic";
export default function Page({ params }: { params: { id: string } }) { return <ShopOrderDetail id={Number(params.id)} />; }
