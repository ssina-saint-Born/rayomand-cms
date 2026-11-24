import { NextResponse } from "next/server";

export function middleware() {
  return NextResponse.json({ error: "Start your download from the product page." }, { status: 403 });
}

export const config = { matcher: ["/downloads/:path*"] };
