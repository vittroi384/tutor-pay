"use client";
/**
 * 로그인 허용 계정 관리 (클라이언트, 관리자만 편집) — 권한 변경(관리자/실무자/조회 전용), 비활성화/활성화, 삭제(2단계 확인), 새 사용자 추가.
 * .env ALLOWED_EMAILS 에 있는 '서버 설정' 계정은 화면에서 끌 수 없다(전원 잠금 방지).
 */
import { useState, useTransition } from "react";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { useToast } from "@/components/ui/Toast";
import { fmtDateTime } from "@/lib/format";
import { addUser, deleteUser, updateUser } from "./actions";

type Row = {
  id: number;
  email: string;
  name: string | null;
  role: string;
  isActive: boolean;
  lastLoginAt: string | null;
};

export function UsersPanel({
  rows,
  me,
  canEdit,
  envEmails,
}: {
  rows: Row[];
  me: string;
  canEdit: boolean;
  envEmails: string[];
}) {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"admin" | "staff" | "viewer">("staff");
  const [pending, start] = useTransition();
  const known = new Set(rows.map((r) => r.email));
  const envOnly = envEmails.filter((e) => !known.has(e)); // .env 에는 있지만 아직 한 번도 로그인 안 한 계정
  return (
    <div>
      <div className="table-scroll max-h-72">
        <table className="dense w-full text-[13px]">
          <thead>
            <tr>
              <th className="text-left">이메일</th>
              <th className="text-left">이름</th>
              <th className="text-left">권한</th>
              <th className="text-left">최근 로그인</th>
              <th className="text-left">상태</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && envOnly.length === 0 && (
              <tr>
                <td colSpan={6} className="py-4 text-center text-slate-500">
                  등록된 사용자가 없습니다.
                </td>
              </tr>
            )}
            {rows.map((u) => {
              const isEnv = envEmails.includes(u.email);
              const isMe = u.email === me;
              return (
                <tr key={u.id} className={u.isActive ? "" : "text-slate-400"}>
                  <td>
                    {u.email}
                    {isMe && (
                      <span className="ml-1 text-[11px] text-brand-700">
                        (나)
                      </span>
                    )}
                    {isEnv && (
                      <span
                        className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600"
                        title="서버 .env ALLOWED_EMAILS 에 적힌 초기 관리자 — 화면에서 끌 수 없음"
                      >
                        서버 설정
                      </span>
                    )}
                  </td>
                  <td>{u.name ?? "-"}</td>
                  <td>
                    {canEdit ? (
                      <select
                        className="input w-auto py-0.5"
                        value={u.role}
                        disabled={pending || isMe}
                        onChange={(e) =>
                          start(async () => {
                            const r = await updateUser(u.id, {
                              role: e.target.value as
                                "admin" | "staff" | "viewer",
                            });
                            r.ok
                              ? toast("권한을 바꿨어요")
                              : toast(r.error, "error");
                          })
                        }
                      >
                        <option value="admin">관리자</option>
                        <option value="staff">실무자</option>
                        <option value="viewer">조회 전용</option>
                      </select>
                    ) : u.role === "admin" ? (
                      "관리자"
                    ) : u.role === "staff" ? (
                      "실무자"
                    ) : (
                      "조회 전용"
                    )}
                  </td>
                  <td className="text-slate-500">
                    {u.lastLoginAt ? fmtDateTime(u.lastLoginAt) : "아직 없음"}
                  </td>
                  <td>{u.isActive ? "활성" : "비활성"}</td>
                  <td className="whitespace-nowrap text-right">
                    {canEdit && !isMe && !isEnv && (
                      <>
                        <button
                          className="btn-ghost btn-sm"
                          disabled={pending}
                          onClick={() =>
                            start(async () => {
                              const r = await updateUser(u.id, {
                                isActive: !u.isActive,
                              });
                              r.ok
                                ? toast(
                                    u.isActive
                                      ? "비활성화했어요 (로그인 차단)"
                                      : "활성화했어요",
                                  )
                                : toast(r.error, "error");
                            })
                          }
                        >
                          {u.isActive ? "비활성화" : "활성화"}
                        </button>
                        <ConfirmButton
                          disabled={pending}
                          onConfirm={() =>
                            start(async () => {
                              const r = await deleteUser(u.id);
                              r.ok
                                ? toast(`삭제했어요 · ${u.email}`)
                                : toast(r.error, "error");
                            })
                          }
                        />
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
            {envOnly.map((e) => (
              <tr key={e} className="text-slate-500">
                <td>
                  {e}
                  <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                    서버 설정
                  </span>
                </td>
                <td>-</td>
                <td>관리자</td>
                <td>아직 없음</td>
                <td>첫 로그인 대기</td>
                <td></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11.5px] text-slate-500">
        비활성화 = 로그인 차단(기록 유지), 삭제 = 목록에서 제거. "서버 설정"
        계정은 잠금 방지를 위해 여기서 끌 수 없고 서버 .env 에서 빼야 합니다.
      </p>
      {canEdit && (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div>
            <label className="label">구글 이메일</label>
            <input
              className="input w-56"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@gmail.com"
            />
          </div>
          <div>
            <label className="label">이름</label>
            <input
              className="input w-32"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label className="label">권한</label>
            <select
              className="input w-auto"
              value={role}
              onChange={(e) =>
                setRole(e.target.value as "admin" | "staff" | "viewer")
              }
            >
              <option value="admin">관리자</option>
              <option value="staff">실무자</option>
              <option value="viewer">조회 전용</option>
            </select>
          </div>
          <button
            className="btn-secondary"
            disabled={pending || !email}
            onClick={() =>
              start(async () => {
                const r = await addUser(email, name.trim() || null, role);
                if (r.ok) {
                  toast(`사용자를 추가했어요 · ${email}`);
                  setEmail("");
                  setName("");
                } else toast(r.error, "error");
              })
            }
          >
            사용자 추가
          </button>
        </div>
      )}
    </div>
  );
}
