import { getPost } from "@/lib/posts";
import PostEditor from "@/components/admin/PostEditor";
export const dynamic = "force-dynamic";
export default async function EditEditor({ params }: {
    params: {
        id: string;
    };
}) {
    const id = Number(params.id);
    const post = (await getPost(id));
    return <PostEditor postId={id} type={post?.type === "page" ? "page" : "post"}/>;
}
