"use client";
import { useEffect, useState } from "react";

/** 두 단계 삭제 버튼: 첫 클릭 → "정말 삭제" 로 바뀌고 3초 안에 다시 클릭해야 실행 */
export function ConfirmButton({
  onConfirm,
  label = "삭제",
  confirmLabel = "정말 삭제",
  className = "btn-ghost btn-sm text-rose-600",
  disabled,
}: {
  onConfirm: () => void | Promise<void>;
  label?: React.ReactNode;
  confirmLabel?: string;
  className?: string;
  disabled?: boolean;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      type="button"
      disabled={disabled}
      className={`${className} ${armed ? "!bg-rose-600 !text-white !border-rose-600" : ""}`}
      onClick={() => {
        if (!armed) return setArmed(true);
        setArmed(false);
        void onConfirm();
      }}
    >
      {armed ? confirmLabel : label}
    </button>
  );
}
