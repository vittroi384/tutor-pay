/**
 * 각 화면 상단의 제목 + 부제목 + 오른쪽 도구 영역(월 이동, 버튼 등) 공통 레이아웃.
 */
export function PageHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="no-print mb-3 flex flex-wrap items-center justify-between gap-2 sm:mb-4 sm:gap-3">
      <div>
        <h1 className="text-[17px] font-semibold text-slate-800 sm:text-lg">
          {title}
        </h1>
        {subtitle && (
          <div className="text-[12px] text-slate-500">{subtitle}</div>
        )}
      </div>
      {right && (
        <div className="flex flex-wrap items-center gap-2">{right}</div>
      )}
    </div>
  );
}
