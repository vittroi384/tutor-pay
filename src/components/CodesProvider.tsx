"use client";
/**
 * 지급유형·등급 목록(코드표)을 화면 어디서나 읽을 수 있게 하는 Context.
 * (app) 레이아웃이 DB 에서 읽어 넣어 주고, 칩(PayTypeChip/GradeBadge)·폼·필터가 useCodes() 로 꺼내 쓴다.
 * Provider 밖(예: 스토리북, 테스트)에서는 기본 7종/4등급으로 동작한다.
 */
import { createContext, useContext } from "react";
import { DEFAULT_PAY_TYPE_RULES } from "@/lib/calc";
import { DEFAULT_GRADE_COLOR, DEFAULT_PAY_TYPE_COLOR } from "@/lib/constants";
import type { Grade, PayTypeMeta } from "@/lib/types";

export type Codes = { payTypes: PayTypeMeta[]; grades: Grade[] };

const DEFAULT_CODES: Codes = {
  payTypes: DEFAULT_PAY_TYPE_RULES.map((r, i) => ({
    id: -(i + 1),
    code: r.code,
    sort: r.sort ?? i,
    roleBased: r.roleBased,
    manual: r.manual,
    color: DEFAULT_PAY_TYPE_COLOR[r.code] ?? "slate",
    isActive: true,
    note: null,
  })),
  grades: ["S등급", "A등급", "B등급", "아코연구원"].map((c, i) => ({
    id: -(i + 1),
    code: c,
    label: c,
    sort: i,
    color: DEFAULT_GRADE_COLOR[c] ?? "slate",
  })),
};

const Ctx = createContext<Codes>(DEFAULT_CODES);

export function CodesProvider({
  value,
  children,
}: {
  value: Codes;
  children: React.ReactNode;
}) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCodes(): Codes {
  return useContext(Ctx);
}
