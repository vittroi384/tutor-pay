/**
 * 화면 상단 요약 숫자 카드 줄 (건수·차시·세전·세후·미지급 …).
 * 카드 개수에 맞춰 자동 배치(auto-fit) — 권한에 따라 일부 카드를 숨겨도 남은 카드가 폭을 고르게 채운다.
 */
/** onClick 을 주면 카드가 버튼이 되고(필터 토글 등), active 면 테두리를 강조한다 */
export type SummaryItem = {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "default" | "brand" | "amber" | "rose";
  onClick?: () => void;
  active?: boolean;
  title?: string;
};

export function SummaryStrip({ items }: { items: SummaryItem[] }) {
  const tone: Record<string, string> = {
    default: "text-slate-800",
    brand: "text-brand-700",
    amber: "text-amber-700",
    rose: "text-rose-700",
  };
  return (
    <div className="no-print mb-3 grid grid-cols-2 gap-2 sm:mb-4 md:[grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]">
      {items.map((it) => {
        const inner = (
          <>
            <div className="text-[11px] text-slate-500">{it.label}</div>
            <div
              className={`text-[15px] font-semibold tabular-nums sm:text-[16px] ${tone[it.tone ?? "default"]}`}
            >
              {it.value}
            </div>
            {it.sub && (
              <div className="text-[11px] text-slate-500 tabular-nums">
                {it.sub}
              </div>
            )}
          </>
        );
        return it.onClick ? (
          <button
            key={it.label}
            type="button"
            onClick={it.onClick}
            title={it.title}
            className={`card px-3 py-2 text-left transition hover:border-slate-400 ${it.active ? "ring-2 ring-rose-300 border-rose-300" : ""}`}
          >
            {inner}
          </button>
        ) : (
          <div key={it.label} className="card px-3 py-2">
            {inner}
          </div>
        );
      })}
    </div>
  );
}
