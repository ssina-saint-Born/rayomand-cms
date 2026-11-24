export async function api<T = any>(path: string, opts?: RequestInit): Promise<T> {
    const res = await fetch(path, {
        ...opts,
        headers: { "Content-Type": "application/json", ...(opts?.headers || {}) },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok)
        throw new Error((data as any).message_key || (data as any).error || res.statusText);
    return data as T;
}
export async function uploadFile(file: File): Promise<any> {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/content/media", { method: "POST", body: form });
    const data = await res.json().catch(() => ({}));
    if (!res.ok)
        throw new Error((data as any).message_key || (data as any).error || "Upload failed");
    return data;
}
