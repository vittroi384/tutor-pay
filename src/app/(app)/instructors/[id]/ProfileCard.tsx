"use client";
/**
 * 강사 프로필 카드 + 수정 서랍.
 * - 사진: 파일을 고르면 브라우저에서 512px 이하 JPEG 로 축소해 dataURL 로 저장(백업에 포함)
 * - 한 줄 소개 / 연락처(이메일) / 특기 교구·콘텐츠(쉼표로 여러 개 → 알약 표시) / 자격·수료(줄마다 하나) / 최근 이력(연도 타임라인)
 */
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import {
  Award,
  BriefcaseBusiness,
  Cake,
  Download,
  Paperclip,
  Mail,
  Package,
  Pencil,
  Phone,
  User,
} from "lucide-react";
import { Drawer } from "@/components/ui/Drawer";
import { useToast } from "@/components/ui/Toast";
import {
  deleteInstructorFile,
  updateInstructorProfile,
  uploadInstructorFile,
} from "../actions";
import { ConfirmButton } from "@/components/ui/ConfirmButton";

type FileMeta = { id: number; name: string; size: number };

type Props = {
  instructorId: number;
  files: FileMeta[];
  name: string;
  phone: string | null;
  photo: string | null;
  intro: string | null;
  birthDate: string | null;
  email: string | null;
  specialty: string | null;
  certifications: string | null;
  career: string | null;
  canEdit: boolean;
};

/** 파일 → 512px 이하로 축소한 JPEG dataURL */
async function fileToSmallDataUrl(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error("이미지를 읽을 수 없습니다."));
      i.src = url;
    });
    const max = 512;
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** 사진 또는 이니셜 원 */
export function Avatar({
  photo,
  name,
  size = 56,
}: {
  photo: string | null;
  name: string;
  size?: number;
}) {
  if (photo)
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={photo}
        alt={name}
        width={size}
        height={size}
        className="shrink-0 rounded-full object-cover shadow-sm ring-2 ring-white outline outline-1 outline-slate-200"
        style={{ width: size, height: size }}
      />
    );
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-slate-100 to-slate-200 text-slate-400 shadow-sm ring-2 ring-white outline outline-1 outline-slate-200"
      style={{ width: size, height: size }}
    >
      <User size={size * 0.46} />
    </div>
  );
}

/** "2024 내용" / "2023~ 내용" 같은 줄이면 연도 배지를 붙인 타임라인 항목으로 */
function CareerLine({ line }: { line: string }) {
  const m = line.match(/^(\d{4}(?:\s*[~–-]\s*(?:\d{4})?)?\.?)\s+(.+)$/);
  return (
    <li className="relative pl-5 leading-6">
      <span className="absolute top-[9px] left-0 h-2 w-2 rounded-full bg-brand-400 ring-2 ring-brand-100" />
      {m ? (
        <>
          <span className="mr-1.5 font-semibold text-slate-800 tabular-nums">
            {m[1]}
          </span>
          <span className="text-slate-600">{m[2]}</span>
        </>
      ) : (
        <span className="text-slate-600">{line}</span>
      )}
    </li>
  );
}

/** YYYY-MM-DD → 만 나이 (오늘 기준) */
function ageFrom(birth: string): number {
  const [y, m, dd] = birth.split("-").map(Number);
  const t = new Date();
  let age = t.getFullYear() - y;
  if (t.getMonth() + 1 < m || (t.getMonth() + 1 === m && t.getDate() < dd))
    age--;
  return age;
}

function fmtSize(b: number): string {
  return b < 1024 * 1024
    ? `${Math.max(1, Math.round(b / 1024))}KB`
    : `${(b / 1024 / 1024).toFixed(1)}MB`;
}

const splitList = (s: string | null, sep: RegExp) =>
  (s ?? "")
    .split(sep)
    .map((x) => x.trim())
    .filter(Boolean);

export function ProfileCard({
  instructorId,
  files,
  name,
  phone,
  photo,
  intro,
  birthDate,
  email,
  specialty,
  certifications,
  career,
  canEdit,
}: Props) {
  const { toast } = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [d, setD] = useState({
    photo,
    intro: intro ?? "",
    birthDate: birthDate ?? "",
    email: email ?? "",
    specialty: specialty ?? "",
    certifications: certifications ?? "",
    career: career ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const attachRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  /** 여러 파일을 순서대로 올린다 (파일당 최대 5MB) */
  const uploadFiles = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    setUploading(true);
    setFileError(null);
    try {
      for (const f of Array.from(list)) {
        if (f.size > 5 * 1024 * 1024)
          throw new Error(`${f.name}: 5MB 이하만 올릴 수 있어요.`);
        const dataBase64 = await new Promise<string>((res, rej) => {
          const r = new FileReader();
          r.onload = () => res(String(r.result).split(",")[1] ?? "");
          r.onerror = () =>
            rej(new Error(`${f.name}: 파일을 읽지 못했습니다.`));
          r.readAsDataURL(f);
        });
        const r = await uploadInstructorFile(instructorId, {
          name: f.name,
          mimeType: f.type,
          dataBase64,
        });
        if (!r.ok) throw new Error(r.error);
      }
      toast("파일을 올렸어요");
      router.refresh();
    } catch (e) {
      setFileError(
        e instanceof Error ? e.message : "파일을 올리지 못했습니다.",
      );
    } finally {
      setUploading(false);
      if (attachRef.current) attachRef.current.value = "";
    }
  };

  const skills = splitList(specialty, /[,，·]/);
  const certs = splitList(certifications, /\n/);
  const careers = splitList(career, /\n/);
  const empty =
    !photo &&
    !intro &&
    !email &&
    skills.length === 0 &&
    certs.length === 0 &&
    careers.length === 0;

  const openDrawer = () => {
    setD({
      photo,
      intro: intro ?? "",
      birthDate: birthDate ?? "",
      email: email ?? "",
      specialty: specialty ?? "",
      certifications: certifications ?? "",
      career: career ?? "",
    });
    setError(null);
    setOpen(true);
  };
  const pick = async (f: File | undefined) => {
    if (!f) return;
    try {
      setD((x) => ({ ...x, photo: null }));
      const url = await fileToSmallDataUrl(f);
      setD((x) => ({ ...x, photo: url }));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "사진을 읽지 못했습니다.");
    }
  };
  const save = () =>
    start(async () => {
      const r = await updateInstructorProfile(instructorId, {
        photo: d.photo,
        intro: d.intro.trim() || null,
        birthDate: d.birthDate || null,
        email: d.email.trim() || null,
        specialty: d.specialty.trim() || null,
        certifications: d.certifications.trim() || null,
        career: d.career.trim() || null,
      });
      if (!r.ok) return setError(r.error);
      toast("프로필을 저장했어요");
      setOpen(false);
      router.refresh();
    });

  return (
    <div className="card overflow-hidden xl:col-span-2">
      {/* 상단 밴드: 사진 + 이름/소개/연락처 */}
      <div className="relative border-b border-amber-100/80 bg-gradient-to-br from-amber-50/90 via-orange-50/40 to-white px-5 py-4">
        {canEdit && (
          <button
            className="btn-secondary btn-sm absolute top-3 right-3 bg-white/80"
            onClick={openDrawer}
          >
            <Pencil size={13} /> 프로필 수정
          </button>
        )}
        <div className="flex items-center gap-4">
          <Avatar photo={photo} name={name} size={92} />
          <div className="min-w-0">
            <div className="text-[17px] font-bold text-slate-800">{name}</div>
            <div className="mt-0.5 text-[13px] text-slate-600">
              {intro ?? (
                <span className="text-slate-400">
                  한 줄 소개가 아직 없습니다
                  {canEdit ? " — [프로필 수정]에서 작성해 보세요" : ""}
                </span>
              )}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-slate-500">
              {birthDate && (
                <span
                  className="inline-flex items-center gap-1"
                  title={`생년월일 ${birthDate}`}
                >
                  <Cake size={12} className="text-slate-400" /> 만{" "}
                  {ageFrom(birthDate)}세
                </span>
              )}
              {phone && (
                <span className="inline-flex items-center gap-1 tabular-nums">
                  <Phone size={12} className="text-slate-400" /> {phone}
                </span>
              )}
              {email && (
                <span className="inline-flex items-center gap-1">
                  <Mail size={12} className="text-slate-400" /> {email}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 본문: 특기 / 자격 / 이력 */}
      {empty ? (
        <div className="p-6 text-center text-[13px] text-slate-400">
          아직 작성된 프로필이 없습니다.
          {canEdit && (
            <div className="mt-2">
              <button className="btn-secondary btn-sm" onClick={openDrawer}>
                <Pencil size={13} /> 지금 작성하기
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="grid gap-x-6 gap-y-4 p-5 sm:grid-cols-2">
          <div className="space-y-4">
            <section>
              <div className="mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold text-slate-500">
                <Package size={13} className="text-brand-600" /> 특기
                교구·콘텐츠
              </div>
              {skills.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {skills.map((t) => (
                    <span
                      key={t}
                      className="rounded-full bg-brand-50 px-2.5 py-0.5 text-[12px] font-medium text-amber-800 ring-1 ring-amber-200/70"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="text-[12.5px] text-slate-400">-</div>
              )}
            </section>
            <section>
              <div className="mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold text-slate-500">
                <Award size={13} className="text-teal-600" /> 자격·수료
              </div>
              {certs.length ? (
                <ul className="space-y-1 text-[12.5px]">
                  {certs.map((c) => (
                    <li
                      key={c}
                      className="flex items-start gap-1.5 text-slate-600"
                    >
                      <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-teal-400" />
                      {c}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-[12.5px] text-slate-400">-</div>
              )}
            </section>
          </div>
          <section>
            <div className="mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold text-slate-500">
              <BriefcaseBusiness size={13} className="text-slate-500" /> 최근
              이력
            </div>
            {careers.length ? (
              <ul className="space-y-1.5 border-l border-slate-100 pl-1 text-[12.5px] [&>li]:ml-1">
                {careers.map((l, i) => (
                  <CareerLine key={i} line={l} />
                ))}
              </ul>
            ) : (
              <div className="text-[12.5px] text-slate-400">-</div>
            )}
          </section>
        </div>
      )}

      {/* 첨부 파일 — 이력서·자격증 사본 등 여러 개 */}
      {(files.length > 0 || canEdit) && (
        <div className="border-t border-slate-100 px-5 py-3.5">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-500">
              <Paperclip size={13} className="text-slate-500" /> 첨부 파일
              {files.length > 0 && (
                <span className="font-normal text-slate-400">
                  {files.length}개
                </span>
              )}
            </div>
            {canEdit && (
              <>
                <button
                  className="btn-secondary btn-sm"
                  disabled={uploading}
                  onClick={() => attachRef.current?.click()}
                >
                  {uploading ? "올리는 중…" : "파일 추가"}
                </button>
                <input
                  ref={attachRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => uploadFiles(e.target.files)}
                />
              </>
            )}
          </div>
          {files.length === 0 ? (
            <div className="text-[12px] text-slate-400">
              이력서·자격증 사본 등을 올려두면 여기에서 바로 내려받을 수 있어요.
              (파일당 5MB, 여러 개 가능)
            </div>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {files.map((f) => (
                <li
                  key={f.id}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50/60 py-1 pr-1 pl-2.5 text-[12px]"
                >
                  <a
                    href={`/api/instructor-file/${f.id}`}
                    className="inline-flex max-w-[240px] items-center gap-1.5 hover:text-brand-700 hover:underline"
                    title={`${f.name} 내려받기`}
                  >
                    <Download size={12} className="shrink-0 text-slate-400" />
                    <span className="truncate font-medium">{f.name}</span>
                  </a>
                  <span className="text-slate-400 tabular-nums">
                    {fmtSize(f.size)}
                  </span>
                  {canEdit && (
                    <ConfirmButton
                      className="btn-ghost btn-sm px-1.5 text-slate-400 hover:text-rose-600"
                      label="×"
                      confirmLabel="삭제(복원 불가)"
                      onConfirm={async () => {
                        const r = await deleteInstructorFile(f.id);
                        if (r.ok) {
                          toast("파일을 삭제했어요");
                          router.refresh();
                        } else toast(r.error, "error");
                      }}
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
          {fileError && (
            <p className="mt-1.5 text-[12px] text-rose-600">{fileError}</p>
          )}
        </div>
      )}

      {open && (
        <Drawer
          open
          title={`${name} — 프로필 수정`}
          onClose={() => setOpen(false)}
        >
          <div className="space-y-4">
            <div>
              <label className="label">프로필 사진</label>
              <div className="flex items-center gap-3">
                <Avatar photo={d.photo} name={name} size={72} />
                <div className="space-x-2">
                  <button
                    className="btn-secondary btn-sm"
                    onClick={() => fileRef.current?.click()}
                  >
                    사진 선택
                  </button>
                  {d.photo && (
                    <button
                      className="btn-ghost btn-sm"
                      onClick={() => setD((x) => ({ ...x, photo: null }))}
                    >
                      사진 제거
                    </button>
                  )}
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => pick(e.target.files?.[0])}
                  />
                </div>
              </div>
              <p className="mt-1 text-[11px] text-slate-400">
                어떤 사진이든 자동으로 작게 줄여 저장합니다.
              </p>
            </div>
            <div>
              <label className="label">한 줄 소개</label>
              <input
                className="input"
                maxLength={120}
                value={d.intro}
                onChange={(e) => setD((x) => ({ ...x, intro: e.target.value }))}
                placeholder="예: 아이들 눈높이 로봇 수업 4년차, 유아~초등 전문"
              />
            </div>
            <div>
              <label className="label">
                생년월일{" "}
                <span className="font-normal text-slate-400">
                  — 만 나이로 표시됩니다
                </span>
              </label>
              <input
                type="date"
                className="input"
                value={d.birthDate}
                onChange={(e) =>
                  setD((x) => ({ ...x, birthDate: e.target.value }))
                }
              />
            </div>
            <div>
              <label className="label">이메일</label>
              <input
                className="input"
                type="email"
                value={d.email}
                onChange={(e) => setD((x) => ({ ...x, email: e.target.value }))}
                placeholder="예: name@example.com"
              />
            </div>
            <div>
              <label className="label">
                특기 교구·콘텐츠{" "}
                <span className="font-normal text-slate-400">
                  — 쉼표(,)로 여러 개
                </span>
              </label>
              <input
                className="input"
                value={d.specialty}
                onChange={(e) =>
                  setD((x) => ({ ...x, specialty: e.target.value }))
                }
                placeholder="예: 카미봇, 레고 스파이크, AI 투닝"
              />
            </div>
            <div>
              <label className="label">
                자격·수료{" "}
                <span className="font-normal text-slate-400">
                  — 한 줄에 하나씩
                </span>
              </label>
              <textarea
                className="input"
                rows={3}
                value={d.certifications}
                onChange={(e) =>
                  setD((x) => ({ ...x, certifications: e.target.value }))
                }
                placeholder={"예:\nSW코딩자격 2급\n유아 코딩 지도사"}
              />
            </div>
            <div>
              <label className="label">
                최근 이력{" "}
                <span className="font-normal text-slate-400">
                  — 한 줄에 하나씩, "연도 내용"으로 쓰면 타임라인으로 표시
                </span>
              </label>
              <textarea
                className="input"
                rows={7}
                value={d.career}
                onChange={(e) =>
                  setD((x) => ({ ...x, career: e.target.value }))
                }
                placeholder={
                  "예:\n2025~ TutorPay 출강\n2024 ○○초 방과후 코딩 강사\n2023 △△유치원 놀이코딩 수업"
                }
              />
            </div>
            {error && <p className="text-[12.5px] text-rose-600">{error}</p>}
            <div className="flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setOpen(false)}>
                취소
              </button>
              <button className="btn-primary" disabled={pending} onClick={save}>
                저장
              </button>
            </div>
          </div>
        </Drawer>
      )}
    </div>
  );
}
