/**
 * 현재 로그인 사용자 확인 (서버 전용).
 * - getCurrentUser: 세션의 이메일을 users 테이블과 매 요청 대조 → 비활성화/권한 변경이 즉시 반영
 * - requireUser: 페이지용 (없으면 /login 으로), requireEditor: 서버 액션용 (조회 전용 계정은 변경 거부)
 * - AUTH_DISABLED=true 이면 '로컬 관리자'로 통과 (개발용)
 */
import "server-only";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AUTH_DISABLED, allowedEmails } from "@/auth.config";
import { db } from "@/db";
import { users } from "@/db/schema";

/** 권한: admin(관리자) > staff(실무자) > viewer(조회 전용 — 교구 '반납'만 가능) */
export type Role = "admin" | "staff" | "viewer";
export const ROLE_LABELS: Record<Role, string> = {
  admin: "관리자",
  staff: "실무자",
  viewer: "조회 전용",
};
/** 등록·수정·삭제가 가능한 권한인지 (관리자·실무자) */
export function isEditor(role: Role): boolean {
  return role === "admin" || role === "staff";
}

export type CurrentUser = {
  email: string;
  name: string;
  role: Role;
};

const LOCAL_ROLE = (process.env.LOCAL_ROLE as Role) || "admin"; // 개발용: LOCAL_ROLE=viewer 로 조회 전용 화면 미리보기
const LOCAL_USER: CurrentUser = {
  email: "local@example.dev",
  name: "로컬 관리자",
  role: LOCAL_ROLE,
};

/**
 * 현재 로그인 사용자. 세션(JWT)의 이메일을 users 테이블과 매 요청 대조해서
 * 비활성화·권한 변경이 다음 요청부터 바로 반영되게 한다.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  if (AUTH_DISABLED) return LOCAL_USER;
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return null;
  const row = await db.query.users.findFirst({ where: eq(users.email, email) });
  // 비활성화된 계정은 차단. 단 .env ALLOWED_EMAILS 계정은 잠금 방지를 위해 항상 통과
  if (row && !row.isActive && !allowedEmails().includes(email)) return null;
  const role = (row?.role as Role | undefined) ?? "admin";
  return { email, name: row?.name ?? session?.user?.name ?? email, role };
}

/** 페이지용: 로그인 안 되어 있으면 /login 으로 */
export async function requireUser(): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  return u;
}

/** 서버 액션용: 등록·수정·삭제 권한 확인 (관리자·실무자만, 조회 전용은 거부) */
export async function requireEditor(): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) throw new Error("로그인이 필요합니다.");
  if (!isEditor(u.role))
    throw new Error("조회 전용 계정은 변경할 수 없습니다.");
  return u;
}

/** 서버 액션용: 관리자 전용 (로그인 계정 관리 등) */
export async function requireAdmin(): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) throw new Error("로그인이 필요합니다.");
  if (u.role !== "admin") throw new Error("관리자만 할 수 있습니다.");
  return u;
}
