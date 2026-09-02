/**
 * Auth.js(next-auth v5) 설정 — Google 로그인 + 허용 계정 검사.
 * - signIn 콜백: .env ALLOWED_EMAILS 또는 users 테이블에 있는(활성) 계정만 통과. 실패 사유를 /login?error= 로 전달
 * - 첫 로그인 시 users 테이블에 자동 등록(관리자), 이후 로그인마다 lastLoginAt 갱신
 * - jwt/session 콜백: 사용자 권한(role)을 세션에 실어 화면에서 쓰게 한다.
 * Edge 런타임에서 쓸 수 없는 DB 코드가 있으므로 미들웨어는 이 파일 대신 auth.config.ts 만 참조한다.
 */
import NextAuth from "next-auth";
import { eq } from "drizzle-orm";
import { allowedEmails, authConfig } from "./auth.config";
import { db } from "./db";
import { users } from "./db/schema";

export { allowedEmails };

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    /**
     * 로그인 허용 판정. 거절 사유를 /login?error=... 로 넘겨서 화면에 이유가 보이게 한다.
     *  - not_allowed: .env ALLOWED_EMAILS 에도 없고 설정 화면의 사용자 목록에도 없는 계정
     *  - inactive   : 사용자 목록에 있지만 비활성화된 계정 (.env 계정은 자동으로 다시 활성화)
     */
    async signIn({ user }) {
      const email = user.email?.toLowerCase();
      if (!email) return "/login?error=no_email";
      const inEnv = allowedEmails().includes(email);
      const row = await db.query.users.findFirst({
        where: eq(users.email, email),
      });
      if (!inEnv && !row)
        return `/login?error=not_allowed&email=${encodeURIComponent(email)}`;
      if (!inEnv && row && !row.isActive)
        return `/login?error=inactive&email=${encodeURIComponent(email)}`;
      if (!row) {
        await db.insert(users).values({
          email,
          name: user.name ?? null,
          role: "admin",
          lastLoginAt: new Date(),
        });
      } else {
        await db
          .update(users)
          .set({
            lastLoginAt: new Date(),
            name: row.name ?? user.name ?? null,
            ...(inEnv && !row.isActive ? { isActive: true } : {}),
          })
          .where(eq(users.id, row.id));
      }
      return true;
    },
    async jwt({ token, user }) {
      if (user?.email) {
        const row = await db.query.users.findFirst({
          where: eq(users.email, user.email.toLowerCase()),
        });
        token.role = row?.role ?? "admin";
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { role?: string }).role =
          (token.role as string | undefined) ?? "admin";
      }
      return session;
    },
  },
});
