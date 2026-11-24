import { cookies } from "next/headers";
import crypto from "node:crypto";

export function cartKey(): string {
  const jar = cookies();
  let key = jar.get("wc_cart")?.value;
  if (!key) {
    key = crypto.randomBytes(16).toString("hex");
    jar.set("wc_cart", key, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 30 * 86400 });
  }
  return key;
}