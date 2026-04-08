import { NextRequest, NextResponse } from "next/server";

// paths ที่ไม่ต้อง login
const PUBLIC_PATHS = ["/login", "/register", "/api/auth"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // อนุญาต static assets และ public paths ผ่านไปเลย
  if (
    PUBLIC_PATHS.some((p) => pathname.startsWith(p)) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon")
  ) {
    return NextResponse.next();
  }

  // ตรวจ cookie fod_session
  const token = request.cookies.get("fod_session")?.value;

  if (!token) {
    // redirect ไป /login และจำ path เดิมไว้
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  // รัน middleware กับทุก path ยกเว้น _next/static, _next/image, favicon
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
