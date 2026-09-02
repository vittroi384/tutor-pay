/**
 * 교구 관리 화면들이 함께 쓰는 타입·작은 유틸.
 * - Tab/RentalInitial/RentalFilters: 탭과 대여 기록 필터 (EquipmentView 가 보관, 주소창과 동기화)
 * - daysSince: 출고일로부터 며칠째인지 (대여중 배지·상세 서랍에서 사용)
 */
import type { EquipmentRentalRow } from "@/lib/types";

export type Tab = "stock" | "rentals" | "stats";
export type RentalInitial = {
  purposes: string[];
  equipmentId: number | null;
  status: "all" | "open" | "returned";
  q: string;
  lectureId: number | null;
};
/** 대여 기록 필터 — EquipmentView 가 갖고 있어 탭을 오가거나 다른 화면에 다녀와도(주소창 동기화) 유지된다 */
export type RentalFilters = {
  purposes: string[]; // 용도별 보기 — 체크한 것만 표시, 빈 배열 = 전체
  status: RentalInitial["status"];
  equipmentId: number | null;
  lectureId: number | null;
  q: string;
};

export type RentalSortKey =
  "outDate" | "renter" | "equipment" | "quantity" | "status";

export function rentalValue(r: EquipmentRentalRow, k: RentalSortKey): unknown {
  switch (k) {
    case "outDate":
      return r.outDate;
    case "renter":
      return r.renter;
    case "equipment":
      return r.equipmentName;
    case "quantity":
      return r.quantity;
    case "status":
      return r.inDate ?? "9999-99-99"; // 대여중을 뒤로
  }
}
/** 출고일로부터 오늘까지 며칠째인지 */
export function daysSince(outDate: string, today: string): number {
  return Math.max(
    0,
    Math.round(
      (new Date(today + "T00:00:00Z").getTime() -
        new Date(outDate + "T00:00:00Z").getTime()) /
        86400000,
    ),
  );
}
