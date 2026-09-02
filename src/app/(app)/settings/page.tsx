/**
 * 설정·내보내기 — 데이터 규모, 전체/연간 엑셀 백업 링크, 로그인 허용 계정 목록(UsersPanel),
 * 변경 이력·삭제 복원(AuditPanel), AUTH_DISABLED 경고.
 */
import { asc, count, desc } from "drizzle-orm";
import { db } from "@/db";
import {
  auditLogs,
  contents,
  institutions,
  instructors,
  lectures,
  users,
} from "@/db/schema";
import { AUTH_DISABLED } from "@/auth.config";
import { PageHeader } from "@/components/ui/PageHeader";
import { isEditor, requireUser } from "@/lib/session";
import { AuditPanel } from "./AuditPanel";
import { UsersPanel } from "./UsersPanel";

export default async function SettingsPage() {
  const user = await requireUser();
  const [userRows, [lc], [ic], [nc], [cc], [ac], logRows] = await Promise.all([
    db.select().from(users).orderBy(asc(users.email)),
    db.select({ n: count() }).from(lectures),
    db.select({ n: count() }).from(instructors),
    db.select({ n: count() }).from(institutions),
    db.select({ n: count() }).from(contents),
    db.select({ n: count() }).from(auditLogs),
    db
      .select()
      .from(auditLogs)
      .orderBy(desc(auditLogs.at), desc(auditLogs.id))
      .limit(400),
  ]);
  const allowlist = (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return (
    <>
      <PageHeader
        title="설정 · 내보내기"
        subtitle="관리자 계정 · 전체 데이터 백업(엑셀) · 변경 이력과 삭제 복원"
      />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="card">
          <div className="border-b border-slate-200 px-4 py-2.5 text-[13px] font-semibold text-slate-700">
            데이터 내보내기 (백업 겸용)
          </div>
          <div className="space-y-2 p-4 text-[13px]">
            <p className="text-slate-600">
              강의 {lc.n}건 · 강사 {ic.n}명 · 기관 {nc.n}곳 · 콘텐츠 {cc.n}종 ·
              변경 이력 {ac.n}건
            </p>
            <div className="flex flex-wrap gap-2">
              <a className="btn-primary" href="/api/export?type=all">
                전체 데이터 엑셀 내려받기
              </a>
              <a
                className="btn-secondary"
                href={`/api/export?type=year&year=${new Date().getFullYear()}`}
              >
                {new Date().getFullYear()}년 강의배정 엑셀
              </a>
            </div>
            <p className="text-[12px] text-slate-500">
              전체 파일에는 강의배정(시트와 같은 열
              구성)·강사·기관·콘텐츠·단가표·변경이력 시트가 들어 있습니다. DB
              덤프 백업은 서버 cron(scripts/backup.sh)이 매일 수행합니다.
            </p>
          </div>
        </div>
        <div className="card">
          <div className="border-b border-slate-200 px-4 py-2.5 text-[13px] font-semibold text-slate-700">
            로그인 허용 계정
          </div>
          <div className="p-4 text-[13px]">
            {AUTH_DISABLED ? (
              <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-amber-800">
                현재 AUTH_DISABLED=true — 로그인 없이 동작하는 개발 모드입니다.
                운영 배포에서는 반드시 끄세요.
              </p>
            ) : (
              <p className="mb-3 text-slate-600">
                로그인은 <b>아래 목록의 활성 계정</b>과 서버 설정(.env
                ALLOWED_EMAILS)에 적힌 계정만 가능합니다. 새 관리자는 아래
                "사용자 추가"로 등록하면 되고, Google 로그인 앱이 테스트 모드면
                Google Cloud 콘솔의 테스트 사용자에도 같은 이메일을 넣어야
                합니다.
              </p>
            )}
            <UsersPanel
              rows={userRows.map((u) => ({
                id: u.id,
                email: u.email,
                name: u.name,
                role: u.role,
                isActive: u.isActive,
                lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
              }))}
              me={user.email}
              canEdit={user.role === "admin"} // 계정 관리는 관리자 전용
              envEmails={allowlist.map((e) => e.toLowerCase())}
            />
          </div>
        </div>
      </div>
      <div className="mt-4">
        <AuditPanel
          rows={logRows.map((g) => ({
            id: g.id,
            at: g.at.toISOString(),
            userEmail: g.userEmail,
            tableName: g.tableName,
            recordId: g.recordId,
            action: g.action,
            summary: g.summary,
          }))}
          canEdit={isEditor(user.role)} // 삭제 복원은 실무자도 가능
        />
      </div>
    </>
  );
}
