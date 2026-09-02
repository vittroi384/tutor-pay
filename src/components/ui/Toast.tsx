"use client";
/**
 * 우측 하단 토스트 알림. ToastProvider 로 감싸고 useToast().toast("문구", "error"?) 로 호출. 3초 뒤 자동 사라짐.
 */
import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";
import { CheckCircle2, AlertCircle, X } from "lucide-react";

type Toast = { id: number; kind: "success" | "error"; text: string };
type Ctx = { toast: (text: string, kind?: Toast["kind"]) => void };
const ToastCtx = createContext<Ctx>({ toast: () => {} });

/** 앱 전체를 감싸는 Provider — 토스트 목록 상태를 보관하고 화면 우하단에 렌더링 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const seq = useRef(0);
  const toast = useCallback((text: string, kind: Toast["kind"] = "success") => {
    const id = ++seq.current;
    setItems((prev) => [...prev, { id, kind, text }]);
    setTimeout(
      () => setItems((prev) => prev.filter((t) => t.id !== id)),
      kind === "error" ? 6000 : 3500,
    );
  }, []);
  return (
    <ToastCtx.Provider value={{ toast }}>
      {children}
      <div className="no-print pointer-events-none fixed bottom-5 left-1/2 z-[100] flex -translate-x-1/2 flex-col items-center gap-2">
        {items.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-center gap-2 rounded-lg px-4 py-2.5 text-[13px] shadow-lg ring-1 ${
              t.kind === "success"
                ? "bg-slate-800 text-white ring-slate-700"
                : "bg-rose-50 text-rose-800 ring-rose-200"
            }`}
          >
            {t.kind === "success" ? (
              <CheckCircle2 size={16} className="text-brand-400" />
            ) : (
              <AlertCircle size={16} />
            )}
            <span>{t.text}</span>
            <button
              className="ml-1 opacity-60 hover:opacity-100"
              onClick={() => setItems((p) => p.filter((x) => x.id !== t.id))}
              aria-label="닫기"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/** 화면에서 알림 띄우기: const { toast } = useToast(); toast("저장했어요") / toast("실패", "error") */
export function useToast() {
  return useContext(ToastCtx);
}
