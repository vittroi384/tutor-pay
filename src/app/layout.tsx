/**
 * 루트 레이아웃 — 모든 페이지의 공통 <html>/<body>.
 * - 전역 CSS(globals.css), 브라우저 탭 제목(APP_NAME), 토스트 알림 Provider 를 여기서 감싼다.
 * - force-dynamic: 모든 페이지를 요청 시점에 렌더링(DB 값이 항상 최신).
 */
import type { Metadata } from "next";
import "./globals.css";
import { APP_NAME, APP_TAGLINE } from "@/lib/constants";
import { ToastProvider } from "@/components/ui/Toast";

export const metadata: Metadata = {
  title: {
    default: `${APP_NAME} · ${APP_TAGLINE}`,
    template: `%s · ${APP_NAME}`,
  },
  description: "강사 배정·급여정산 관리 웹앱",
};

export const dynamic = "force-dynamic";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className="min-h-full">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
