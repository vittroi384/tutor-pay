"use client";
import { useEffect, useState } from "react";

/**
 * 숫자 칸의 inputMode 는 터치 기기(폰·태블릿)에서만 켠다.
 * 데스크톱 윈도우에서는 inputmode/type=number 가 입력기(IME)에 "숫자 칸" 신호를 보내
 * 한국어 입력기가 영문 모드로 바뀐 채 다음 한글 칸까지 이어지는 문제가 있어(실무자 공통 불편),
 * 데스크톱에서는 일반 텍스트 칸으로 두고 값 검증만 코드로 한다.
 */
export function useNumericInputMode(
  kind: "numeric" | "decimal" = "numeric",
): "numeric" | "decimal" | undefined {
  const [mode, setMode] = useState<"numeric" | "decimal" | undefined>(
    undefined,
  );
  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      window.matchMedia?.("(pointer: coarse)").matches
    )
      setMode(kind);
  }, [kind]);
  return mode;
}
