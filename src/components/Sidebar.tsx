"use client";
/**
 * 좌측 내비게이션.
 * - 데스크톱(lg 이상): 접을 수 있는 고정 사이드바 (메뉴 8개 + 사용자 정보 + 로그아웃)
 * - 모바일/태블릿: 상단 바 + ☰ 버튼 → 왼쪽에서 슬라이드되는 메뉴 (경로가 바뀌면 자동으로 닫힘)
 * 메뉴 항목을 추가하려면 MENU 배열에 한 줄 넣으면 된다.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BarChart3,
  BookOpen,
  CalendarDays,
  ChevronsLeft,
  ChevronsRight,
  Coins,
  Database,
  LayoutDashboard,
  Menu,
  Package,
  Settings,
  Users,
  X,
} from "lucide-react";
import { APP_NAME, APP_TAGLINE } from "@/lib/constants";

const MENU = [
  { href: "/dashboard", label: "대시보드", icon: LayoutDashboard },
  { href: "/lectures", label: "강의배정", icon: CalendarDays },
  { href: "/settlement", label: "정산·명세서", icon: Coins },
  { href: "/instructors", label: "강사 관리", icon: Users },
  { href: "/master", label: "기관·콘텐츠", icon: Database },
  { href: "/equipment", label: "교구 관리", icon: Package },
  { href: "/rates", label: "단가표", icon: BookOpen },
  { href: "/reports", label: "통합보고서", icon: BarChart3 },
  { href: "/settings", label: "설정·내보내기", icon: Settings },
];

type User = { name: string; email: string; role: string };

/**
 * 브랜드 영역 — TutorPay 로고(public/logo.png)와 앱 이름.
 * compact(접힌 사이드바)에서는 로고의 로봇 마크(public/mark.png)만 보여준다.
 */
function Brand({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <div
        className="flex w-full justify-center"
        title={`${APP_NAME} · ${APP_TAGLINE}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/mark.png" alt="TutorPay" className="h-8 w-8" />
      </div>
    );
  }
  return (
    <div className="flex min-w-0 flex-col gap-1.5" title={APP_TAGLINE}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo.png"
        alt="TutorPay"
        className="h-11 w-auto self-start"
      />
      <div className="truncate text-[12px] font-semibold leading-tight tracking-tight text-slate-700">
        {APP_NAME}
      </div>
    </div>
  );
}

function NavLinks({
  pathname,
  collapsed = false,
  onNavigate,
  size = "md",
}: {
  pathname: string;
  collapsed?: boolean;
  onNavigate?: () => void;
  size?: "md" | "lg";
}) {
  return (
    <>
      {MENU.map((m) => {
        const active = pathname === m.href || pathname.startsWith(m.href + "/");
        const Icon = m.icon;
        return (
          <Link
            key={m.href}
            href={m.href}
            title={m.label}
            onClick={onNavigate}
            className={`mx-2 my-0.5 flex items-center gap-2.5 rounded-md px-2.5 ${size === "lg" ? "py-2.5 text-[15px]" : "py-2 text-[13px]"} ${active ? "bg-brand-50 font-semibold text-slate-900 shadow-[inset_3px_0_0_0_var(--color-brand-500)]" : "text-slate-600 hover:bg-slate-100"}`}
          >
            <Icon
              size={size === "lg" ? 19 : 17}
              className={active ? "text-brand-600" : "text-slate-400"}
            />
            {!collapsed && <span>{m.label}</span>}
          </Link>
        );
      })}
    </>
  );
}

function UserBox({ user }: { user: User }) {
  return (
    <div className="mb-1 px-1.5">
      <div className="truncate text-[12px] font-medium text-slate-700">
        {user.name}
      </div>
      <div className="truncate text-[11px] text-slate-400" title={user.email}>
        {user.role === "admin"
          ? "관리자"
          : user.role === "staff"
            ? "실무자"
            : "조회 전용"}{" "}
        · {user.email}
      </div>
    </div>
  );
}

/**
 * 데스크톱(lg 이상): 왼쪽 고정 사이드바(접기 가능)
 * 모바일/태블릿: 상단 바 + 햄버거 → 왼쪽에서 슬라이드되는 메뉴
 */
export function Sidebar({
  user,
  logout,
}: {
  user: User;
  logout?: React.ReactNode;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [open, setOpen] = useState(false);
  const current = MENU.find(
    (m) => pathname === m.href || pathname.startsWith(m.href + "/"),
  );

  // 경로가 바뀌면 모바일 메뉴 닫기, 열려 있는 동안 배경 스크롤 잠금
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      {/* 데스크톱 사이드바 */}
      <aside
        className={`no-print sticky top-0 hidden h-screen shrink-0 flex-col border-r border-slate-200 bg-white transition-[width] lg:flex ${collapsed ? "w-14" : "w-52"}`}
      >
        <div
          className={`flex items-center border-b border-slate-200 ${collapsed ? "h-14 px-2" : "h-[86px] px-3"}`}
        >
          <Brand compact={collapsed} />
        </div>
        <nav className="flex-1 overflow-y-auto py-2">
          <NavLinks pathname={pathname} collapsed={collapsed} />
        </nav>
        <div className="border-t border-slate-200 p-2">
          {!collapsed && <UserBox user={user} />}
          <div className="flex items-center justify-between">
            {!collapsed && logout}
            <button
              className="btn-ghost btn-sm"
              onClick={() => setCollapsed((c) => !c)}
              aria-label={collapsed ? "메뉴 펼치기" : "메뉴 접기"}
            >
              {collapsed ? (
                <ChevronsRight size={15} />
              ) : (
                <ChevronsLeft size={15} />
              )}
            </button>
          </div>
        </div>
      </aside>

      {/* 모바일 상단 바 */}
      <header className="no-print sticky top-0 z-40 flex h-12 items-center gap-2 border-b border-slate-200 bg-white/95 px-3 backdrop-blur lg:hidden">
        <button
          className="btn-ghost -ml-1 px-2"
          onClick={() => setOpen(true)}
          aria-label="메뉴 열기"
        >
          <Menu size={20} />
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/mark.png" alt="TutorPay" className="h-7 w-7 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-semibold text-slate-800">
            {current?.label ?? APP_NAME}
          </div>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo.png"
          alt="AICO SCHOOL"
          className="hidden h-6 w-auto sm:block"
        />
      </header>

      {/* 모바일 슬라이드 메뉴 */}
      {open && (
        <div className="no-print fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div
            className="absolute inset-y-0 left-0 flex w-[280px] max-w-[85vw] flex-col bg-white shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-label="메뉴"
          >
            <div className="flex h-[86px] items-center justify-between border-b border-slate-200 px-3">
              <Brand />
              <button
                className="btn-ghost btn-sm"
                onClick={() => setOpen(false)}
                aria-label="메뉴 닫기"
              >
                <X size={18} />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto py-2">
              <NavLinks
                pathname={pathname}
                size="lg"
                onNavigate={() => setOpen(false)}
              />
            </nav>
            <div className="border-t border-slate-200 p-3">
              <UserBox user={user} />
              <div className="mt-1">{logout}</div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
