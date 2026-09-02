/**
 * 로그인 뒤 화면들의 공통 레이아웃 — 왼쪽 사이드바(모바일은 상단 바) + 본문.
 * - requireUser(): 로그인 안 되어 있으면 /login 으로 보낸다.
 * - 로그아웃 버튼(서버 액션)과 개발용 'AUTH_DISABLED' 표시를 사이드바에 넘긴다.
 * - 지급유형·등급 코드표를 읽어 CodesProvider 로 내려준다 (칩 색·폼 드롭다운이 여기서 읽는다).
 */
import { LogOut } from "lucide-react";
import { signOut } from "@/auth";
import { AUTH_DISABLED } from "@/auth.config";
import { requireUser } from "@/lib/session";
import { Sidebar } from "@/components/Sidebar";
import { CodesProvider } from "@/components/CodesProvider";
import { getGrades, getPayTypes } from "@/lib/queries";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const [payTypes, grades] = await Promise.all([getPayTypes(), getGrades()]);
  const logout = AUTH_DISABLED ? (
    <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-700">
      로그인 꺼짐(개발)
    </span>
  ) : (
    <form
      action={async () => {
        "use server";
        await signOut({ redirectTo: "/login" });
      }}
    >
      <button className="btn-ghost btn-sm" type="submit">
        <LogOut size={14} /> 로그아웃
      </button>
    </form>
  );
  return (
    <CodesProvider value={{ payTypes, grades }}>
      <div className="flex min-h-screen flex-col lg:flex-row">
        <Sidebar user={user} logout={logout} />
        <main className="min-w-0 flex-1 px-3 py-3 sm:px-5 sm:py-4 lg:px-6 lg:py-5">
          {children}
        </main>
      </div>
    </CodesProvider>
  );
}
