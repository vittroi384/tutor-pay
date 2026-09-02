/**
 * 로그인 화면 — Google 계정으로 로그인 버튼 하나.
 * - 이미 로그인돼 있으면 대시보드로, AUTH_DISABLED(개발 모드)면 로그인 없이 통과.
 * - ?error= 로 넘어온 실패 사유(허용 목록 없음/비활성 계정 등)를 사람이 읽을 문구로 보여준다.
 */
import { redirect } from "next/navigation";
import { LogIn } from "lucide-react";
import { signIn } from "@/auth";
import { AUTH_DISABLED } from "@/auth.config";
import { getCurrentUser } from "@/lib/session";
import { APP_NAME, APP_TAGLINE } from "@/lib/constants";

/** 로그인 실패 사유 → 사람이 읽을 문구 */
function errorMessage(code: string, email?: string) {
  const who = email ? `${email} 계정은` : "이 계정은";
  switch (code) {
    case "not_allowed":
    case "AccessDenied":
      return `${who} 허용 목록에 없습니다. 관리자에게 [설정 → 사용자 추가]로 이메일 등록을 요청하세요.`;
    case "inactive":
      return `${who} 비활성화되어 있습니다. 관리자가 [설정]에서 다시 활성화해야 로그인할 수 있습니다.`;
    case "no_email":
      return "구글 계정에서 이메일을 받아오지 못했습니다. 다른 계정으로 시도하세요.";
    case "OAuthCallbackError":
    case "OAuthCallback":
    case "Callback":
      return "구글 로그인 처리 중 오류가 났습니다. 다시 시도하고, 계속되면 관리자에게 알려주세요 (Google OAuth 설정 확인 필요).";
    case "OAuthAccountNotLinked":
      return "이 이메일은 다른 방식으로 이미 등록되어 있습니다.";
    case "Configuration":
      return "서버 로그인 설정에 문제가 있습니다 (관리자 확인 필요).";
    default:
      return `로그인에 실패했습니다 (${code}). 다시 시도해 주세요.`;
  }
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    callbackUrl?: string;
    error?: string;
    email?: string;
  }>;
}) {
  const sp = await searchParams;
  if (AUTH_DISABLED) redirect(sp.callbackUrl || "/dashboard");
  const user = await getCurrentUser();
  if (user) redirect(sp.callbackUrl || "/dashboard");

  return (
    <div className="min-h-screen grid place-items-center bg-slate-50 p-6">
      <div className="card w-full max-w-sm p-8 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo.png"
          alt="TutorPay"
          className="mx-auto mb-5 h-16 w-auto"
        />
        <h1 className="text-lg font-semibold text-slate-800">{APP_NAME}</h1>
        <p className="text-[13px] text-slate-500">{APP_TAGLINE}</p>
        <p className="mt-3 text-[12.5px] text-slate-500">
          관리자 계정(허용된 구글 이메일)으로만 로그인할 수 있습니다.
        </p>
        {sp.error && (
          <p className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-left text-[12.5px] leading-relaxed text-rose-700">
            {errorMessage(sp.error, sp.email)}
          </p>
        )}
        <form
          className="mt-6"
          action={async () => {
            "use server";
            await signIn("google", {
              redirectTo:
                sp.callbackUrl && !sp.callbackUrl.startsWith("/login")
                  ? sp.callbackUrl
                  : "/dashboard",
            });
          }}
        >
          <button
            className="btn-primary w-full justify-center py-2.5"
            type="submit"
          >
            <LogIn size={16} /> Google 계정으로 로그인
          </button>
        </form>
        <p className="mt-4 text-[11.5px] text-slate-400">
          계정이 여러 개면 로그인 창에서 사용할 계정을 고를 수 있습니다.
        </p>
      </div>
    </div>
  );
}
