/**
 * 교구 관리 진입점 — 교구 현황(재고)과 대여 기록을 읽어 EquipmentView 에 넘긴다.
 * URL: ?tab=rentals(대여 기록)|stats(통계), &eq=교구ID / &status=open|returned / &q= / &lec=강의ID / &pu=용도(여러 번 가능).
 * 화면에서 필터를 바꾸면 주소창에도 반영돼(서버 요청 없이) 다른 화면에 갔다가 뒤로 와도 보던 상태가 유지된다.
 */
import { PageHeader } from "@/components/ui/PageHeader";
import { todaySeoul } from "@/lib/format";
import {
  getEquipmentList,
  getEquipmentRentals,
  getInstitutions,
  getInstructors,
} from "@/lib/queries";
import { isEditor, requireUser } from "@/lib/session";
import { EquipmentView } from "./EquipmentView";

export default async function EquipmentPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    eq?: string;
    status?: string;
    q?: string;
    lec?: string;
    pu?: string | string[];
  }>;
}) {
  const sp = await searchParams;
  const user = await requireUser();
  const [equipment, rentals, instructors, institutions] = await Promise.all([
    getEquipmentList(),
    getEquipmentRentals(),
    getInstructors(),
    getInstitutions(),
  ]);
  // 대여처 자동완성 후보: 기관명 + 강사명(활동)
  const renterOptions = [
    ...institutions.filter((i) => i.isActive).map((i) => i.name),
    ...instructors.filter((i) => i.isActive).map((i) => i.name),
  ];
  return (
    <>
      <PageHeader
        title="교구 관리"
        subtitle="사용 가능 = 총 보유 − 대여중 − 수리중 − 폐기 · 대여중은 반납되지 않은 대여 기록에서 자동 계산"
      />
      <EquipmentView
        equipment={equipment}
        rentals={rentals}
        renterOptions={renterOptions}
        today={todaySeoul()}
        canEdit={isEditor(user.role)}
        canReturn={true} // 조회 전용도 반납 버튼은 사용 가능
        initialTab={
          sp.tab === "rentals"
            ? "rentals"
            : sp.tab === "stats"
              ? "stats"
              : "stock"
        }
        initial={{
          equipmentId: sp.eq && /^\d+$/.test(sp.eq) ? Number(sp.eq) : null,
          status:
            sp.status === "open"
              ? "open"
              : sp.status === "returned"
                ? "returned"
                : "all",
          q: sp.q ?? "",
          lectureId: sp.lec && /^\d+$/.test(sp.lec) ? Number(sp.lec) : null,
          purposes: (Array.isArray(sp.pu) ? sp.pu : sp.pu ? [sp.pu] : [])
            .map((v) => v.trim())
            .filter(Boolean),
        }}
      />
    </>
  );
}
