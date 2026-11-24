import ShopProductEditor from "@/components/shop/admin/ShopProductEditor";
export const dynamic = "force-dynamic";
export default function Page({ params }: { params: { id: string } }) { return <ShopProductEditor id={Number(params.id)} />; }
