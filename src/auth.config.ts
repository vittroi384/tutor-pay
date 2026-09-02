import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

/** Edge(미들웨어)에서도 안전한 설정 — DB 접근 없음 */
export const authConfig = {
  // prompt=select_account: 구글 계정이 여러 개인 사람도 매번 계정 선택 화면이 뜨도록 (자동으로 이전 계정 재사용 방지)
  providers: [
    Google({ authorization: { params: { prompt: "select_account" } } }),
  ],
  pages: { signIn: "/login", error: "/login" },
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 14 },
  trustHost: true,
  callbacks: {
    authorized({ auth }) {
      return !!auth?.user;
    },
  },
} satisfies NextAuthConfig;

export const AUTH_DISABLED = process.env.AUTH_DISABLED === "true";

/** .env ALLOWED_EMAILS — 초기 관리자 목록. 여기 있는 계정은 화면에서 비활성화/삭제해도 항상 로그인 가능(잠금 방지) */
export function allowedEmails(): string[] {
  return (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}
