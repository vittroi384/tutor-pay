/**
 * 강사 상세 — 요약 카드, 프로필(사진·특기·주요 이력, ProfileCard), 연도별 누계·등급 변경 이력, 그 아래 월별 실적. 정보 수정 서랍은 InstructorDetailClient.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { PageHeader } from "@/components/ui/PageHeader";
import { GradeBadge } from "@/components/ui/Chips";
import { currentYm, fmtDateTime, fmtSessions, fmtWon } from "@/lib/format";
import {
  getGrades,
  getInstructors,
  getLecturesByInstructor,
  getInstructorFiles,
} from "@/lib/queries";
import { isEditor, requireUser } from "@/lib/session";
import { isUnpaid } from "@/lib/calc";
import { InstructorDetailClient } from "./InstructorDetailClient";
import { ProfileCard } from "./ProfileCard";

export default async function InstructorDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ year?: string }>;
}) {
  const { id: idStr } = await params;
  const sp = await searchParams;
  const user = await requireUser();
  const id = Number(idStr);
  const [instructors, grades, lectures] = await Promise.all([
    getInstructors(),
    getGrades(),
    getLecturesByInstructor(id),
  ]);
  const inst = instructors.find((i) => i.id === id);
  if (!inst) notFound();
  const logs = await db
    .select()
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.tableName, "instructors"),
        eq(auditLogs.recordId, String(id)),
      ),
    )
    .orderBy(desc(auditLogs.at))
    .limit(30);

  const years = [...new Set(lectures.map((l) => l.date.slice(0, 4)))]
    .sort()
    .reverse();
  const year =
    sp.year && years.includes(sp.year)
      ? sp.year
      : (years[0] ?? currentYm().slice(0, 4));
  const yearly = years.map((y) => {
    const ls = lectures.filter((l) => l.date.startsWith(y));
    return {
      year: y,
      count: ls.length,
      sessions: ls.reduce((a, l) => a + (l.sessions ?? 0), 0),
      net: ls.reduce((a, l) => a + l.netAmount, 0),
      headcount: ls.reduce((a, l) => a + (l.headcount ?? 0), 0),
    };
  });
  const monthly = Array.from({ length: 12 }, (_, i) => {
    const ym = `${year}-${String(i + 1).padStart(2, "0")}`;
    const ls = lectures.filter((l) => l.date.startsWith(ym));
    return {
      ym,
      count: ls.length,
      sessions: ls.reduce((a, l) => a + (l.sessions ?? 0), 0),
      gross: ls.reduce((a, l) => a + l.grossAmount, 0),
      net: ls.reduce((a, l) => a + l.netAmount, 0),
      unpaid: ls.filter(isUnpaid).length,
    };
  });
  const gradeLogs = logs.filter((g) => g.action === "grade-change");
  const files = await getInstructorFiles(inst.id);
  const gradeName = (gid: unknown) =>
    gid == null
      ? "미등록"
      : (grades.find((g) => g.id === Number(gid))?.code ?? String(gid));

  return (
    <>
      <PageHeader
        title={inst.name}
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-3">
            <Link
              href="/instructors"
              className="inline-flex items-center gap-1 hover:underline"
            >
              <ArrowLeft size={12} /> 강사 목록으로
            </Link>
            <Link
              href={`/lectures?from=${year}-01-01&to=${year}-12-31&instructor=${inst.id}`}
              className="hover:underline"
            >
              {year}년 강의 목록
            </Link>
            <Link href={`/settlement/${inst.id}`} className="hover:underline">
              이번 달 명세서
            </Link>
          </span>
        }
        right={
          <InstructorDetailClient
            instructor={inst}
            grades={grades}
            canEdit={isEditor(user.role)}
          />
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        <div className="card px-3 py-2">
          <div className="text-[11px] text-slate-500">등급</div>
          <div>
            <GradeBadge gradeCode={inst.gradeCode} full />
          </div>
        </div>
        <div className="card px-3 py-2">
          <div className="text-[11px] text-slate-500">지역</div>
          <div>{inst.region ?? "-"}</div>
        </div>
        <div className="card px-3 py-2">
          <div className="text-[11px] text-slate-500">연락처</div>
          <div className="tabular-nums">{inst.phone ?? "-"}</div>
        </div>
        <div className="card px-3 py-2">
          <div className="text-[11px] text-slate-500">활동</div>
          <div>{inst.isActive ? "활동 중" : "비활성(out)"}</div>
        </div>
        <div className="card px-3 py-2">
          <div className="text-[11px] text-slate-500">비고</div>
          <div className="truncate" title={inst.note ?? ""}>
            {inst.note ?? "-"}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <ProfileCard
          instructorId={inst.id}
          files={files.map((f) => ({ id: f.id, name: f.name, size: f.size }))}
          name={inst.name}
          phone={inst.phone}
          photo={inst.photo}
          intro={inst.intro}
          birthDate={inst.birthDate}
          email={inst.email}
          specialty={inst.specialty}
          certifications={inst.certifications}
          career={inst.career}
          canEdit={isEditor(user.role)}
        />
        <div className="space-y-4">
          <div className="card overflow-x-auto">
            <div className="border-b border-slate-200 px-4 py-2.5 text-[13px] font-semibold text-slate-700">
              연도별 누계
            </div>
            <table className="dense w-full min-w-[360px] text-[13px]">
              <thead>
                <tr>
                  <th className="text-left">연도</th>
                  <th className="text-right">횟수</th>
                  <th className="text-right">차시</th>
                  <th className="text-right">인원</th>
                  <th className="text-right">세후</th>
                </tr>
              </thead>
              <tbody>
                {yearly.map((y) => (
                  <tr key={y.year}>
                    <td>{y.year}</td>
                    <td className="num">{y.count}</td>
                    <td className="num">{fmtSessions(y.sessions)}</td>
                    <td className="num">{y.headcount}</td>
                    <td className="num">{fmtWon(y.net)}</td>
                  </tr>
                ))}
                {yearly.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-slate-500">
                      강의 실적이 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="card">
            <div className="border-b border-slate-200 px-4 py-2.5 text-[13px] font-semibold text-slate-700">
              등급 변경 이력
            </div>
            <ul className="divide-y divide-slate-100 text-[12px]">
              {gradeLogs.length === 0 && (
                <li className="px-4 py-3 text-slate-500">
                  등급 변경 이력이 없습니다.
                </li>
              )}
              {gradeLogs.map((g) => {
                const b = g.before as { gradeId?: number | null } | null;
                const a = g.after as { gradeId?: number | null } | null;
                return (
                  <li
                    key={g.id}
                    className="flex items-center gap-2 px-4 py-1.5"
                  >
                    <span className="w-24 text-slate-400">
                      {fmtDateTime(g.at)}
                    </span>
                    <span>
                      {gradeName(b?.gradeId)} → <b>{gradeName(a?.gradeId)}</b>
                    </span>
                    <span className="ml-auto text-slate-400">
                      {(g.userEmail ?? "").split("@")[0]}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
      <div className="mt-4">
        <div className="card overflow-x-auto">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
            <div className="text-[13px] font-semibold text-slate-700">
              {year}년 월별 실적
            </div>
            <form className="flex items-center gap-2 text-[12px]">
              <select
                name="year"
                defaultValue={year}
                className="input w-auto py-1"
              >
                {(years.length ? years : [year]).map((y) => (
                  <option key={y} value={y}>
                    {y}년
                  </option>
                ))}
              </select>
              <button className="btn-secondary btn-sm">보기</button>
            </form>
          </div>
          <table className="dense w-full min-w-[520px] text-[13px]">
            <thead>
              <tr>
                <th className="text-left">월</th>
                <th className="text-right">강의 횟수</th>
                <th className="text-right">차시</th>
                <th className="text-right">세전</th>
                <th className="text-right">세후</th>
                <th className="text-right">미지급</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {monthly.map((m) => (
                <tr
                  key={m.ym}
                  className={m.count === 0 ? "text-slate-300" : ""}
                >
                  <td>{Number(m.ym.slice(5))}월</td>
                  <td className="num">{m.count}</td>
                  <td className="num">{fmtSessions(m.sessions)}</td>
                  <td className="num">{fmtWon(m.gross)}</td>
                  <td className="num">{fmtWon(m.net)}</td>
                  <td className="num">
                    {m.unpaid ? (
                      <span className="text-amber-700">{m.unpaid}건</span>
                    ) : m.count ? (
                      "완료"
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="whitespace-nowrap text-right">
                    {m.count > 0 && (
                      <>
                        <Link
                          className="text-[12px] text-brand-700 hover:underline"
                          href={`/lectures?ym=${m.ym}&instructor=${inst.id}`}
                        >
                          강의
                        </Link>
                        <span className="mx-1 text-slate-300">·</span>
                        <Link
                          className="text-[12px] text-brand-700 hover:underline"
                          href={`/settlement/${inst.id}?ym=${m.ym}`}
                        >
                          명세서
                        </Link>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
