import PostEditor from "@/components/admin/PostEditor";

export const dynamic = "force-dynamic";

export default function NewEditor({
  searchParams,
}: {
  searchParams: { type?: string };
}) {
  const type = searchParams.type === "page" ? "page" : "post";
  return <PostEditor type={type} />;
}