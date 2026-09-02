import { NextResponse, type NextRequest } from "next/server";

/**
 * 가벼운 1차 관문: 세션 쿠키가 없으면 /login 으로 보낸다.
 * 실제 토큰 검증·권한 확인은 각 페이지/서버 액션의 requireUser / requireEditor 가 Node 런타임에서 수행한다.
 * (미들웨어에서 next-auth 를 직접 쓰지 않아 Edge 런타임 경고와 번들 크기를 피함)
 */
const disabled = process.env.AUTH_DISABLED === "true";
const SESSION_COOKIES = [
  "__Secure-authjs.session-token",
  "authjs.session-token",
];

export default function middleware(req: NextRequest) {
  if (disabled) return NextResponse.next();
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/login")) return NextResponse.next();
  const hasSession = SESSION_COOKIES.some((c) => req.cookies.has(c));
  if (!hasSession) {
    const url = new URL("/login", req.nextUrl.origin);
    url.searchParams.set(
      "callbackUrl",
      req.nextUrl.pathname + req.nextUrl.search,
    );
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api/auth|_next/static|_next/image|favicon.ico|robots.txt).*)",
  ],
};
