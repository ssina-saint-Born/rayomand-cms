import TermsManager from "@/components/admin/TermsManager";

export const dynamic = "force-dynamic";

export default function CategoriesPage() {
  return <TermsManager taxonomy="category" />;
}