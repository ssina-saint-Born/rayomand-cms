import { ok, readBody, auth } from "@/lib/api";
import { registerDevice, listDevices, removeDevice } from "@/lib/devices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Register or refresh this install. The app calls this after sign-in and on
// resume so the operator's device list shows real activity.
export async function POST(req: Request) {
    const { user, res } = await auth("subscriber");
    if (res)
        return res;
    const body = await readBody(req);
    const deviceId = String(body.device_id || "").trim();
    if (!deviceId)
        return ok({ registered: false, message: "No device id sent." });
    await registerDevice({
        userId: user!.id,
        deviceId,
        platform: String(body.platform || "android"),
        label: String(body.label || ""),
        appVersion: String(body.app_version || ""),
    });
    return ok({ registered: true });
}

export async function GET() {
    const { user, res } = await auth("subscriber");
    if (res)
        return res;
    return ok({ devices: await listDevices(user!.id) });
}

export async function DELETE(req: Request) {
    const { user, res } = await auth("subscriber");
    if (res)
        return res;
    const deviceId = new URL(req.url).searchParams.get("device_id") || "";
    return ok({ removed: deviceId ? await removeDevice(user!.id, deviceId) : false });
}
