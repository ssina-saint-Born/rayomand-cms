
import { getTranslator } from "@/lib/i18n-server";
import { Card } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

export default function UpdatePage() {
    const tr = getTranslator();
  return (
    <div>
      <h1 className="text-[23px] text-rm-dark mb-5">{tr("Workspace updates")}</h1>
      <div className="max-w-2xl">
        <Card>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-rm-bg text-rm-muted text-xl">—</span>
            <div>
              <p className="font-semibold text-rm-dark">{tr("Update checks are not configured.")}</p>
              <p className="text-sm text-rm-muted">{tr("Rayomand CMS 1.0 · local workspace. Install verified application updates manually.")}</p>
            </div>
          </div>
        </Card>
        <p className="text-xs text-rm-muted mt-3">{tr("Updates are managed locally; no external update service is contacted.")}</p>
      </div>
    </div>
  );
}