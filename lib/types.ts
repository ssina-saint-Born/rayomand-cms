export type Role =
  | "administrator"
  | "editor"
  | "author"
  | "contributor"
  | "subscriber"
  | "customer";

export type PostStatus =
  | "publish"
  | "draft"
  | "pending"
  | "private"
  | "future"
  | "trash";

export type PostType = "post" | "page";

export interface User {
  id: number;
  username: string;
  email: string;
  display_name: string;
  role: Role;
  bio: string;
  created_at: string;
}

export interface Block {
  id: string;
  type: string;
  attrs: Record<string, any>;
}

export interface PostSeoMeta {
  seo_title?: string;
  seo_description?: string;
  seo_canonical?: string;
  seo_image?: string;
  seo_noindex?: string;
}

export interface Post {
  id: number;
  type: PostType;
  title: string;
  slug: string;
  content: Block[];
  excerpt: string;
  status: PostStatus;
  author_id: number;
  parent_id: number;
  featured_media_id: number | null;
  comment_status: "open" | "closed";
  sticky: number;
  format: string;
  menu_order: number;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  // joined helpers
  author?: User;
  categories?: Term[];
  tags?: Term[];
  featured_media?: Media | null;
  comment_count?: number;
  seo?: PostSeoMeta;
}

export interface Term {
  id: number;
  taxonomy: "category" | "tag";
  name: string;
  slug: string;
  description: string;
  parent_id: number;
  count?: number;
}

export interface Comment {
  id: number;
  post_id: number;
  user_id: number | null;
  author_name: string;
  author_email: string;
  author_url: string;
  content: string;
  status: "approved" | "pending" | "spam" | "trash";
  parent_id: number;
  created_at: string;
  post_title?: string;
}

export interface Media {
  id: number;
  filename: string;
  stored_name: string;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  alt: string;
  caption: string;
  title: string;
  uploaded_by: number | null;
  created_at: string;
  url?: string;
}

export interface Menu {
  id: number;
  name: string;
  location: string;
  items?: MenuItem[];
}

export interface MenuItem {
  id: number;
  menu_id: number;
  label: string;
  url: string;
  type: "custom" | "page" | "post" | "category";
  object_id: number | null;
  parent_id: number;
  position: number;
}

export const ROLES: { value: Role; label: string }[] = [
  { value: "administrator", label: "Administrator" },
  { value: "editor", label: "Editor" },
  { value: "author", label: "Author" },
  { value: "contributor", label: "Contributor" },
  { value: "subscriber", label: "Subscriber" },
  { value: "customer", label: "Customer" },
];

export const ROLE_RANK: Record<Role, number> = {
  administrator: 5,
  editor: 4,
  author: 3,
  contributor: 2,
  subscriber: 1,
  customer: 1,
};