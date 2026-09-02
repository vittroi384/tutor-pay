/** 검색형 선택 상자 — 입력하면 목록이 걸러지고, 없는 값은 새로 입력으로 처리(기관·콘텐츠 입력에 사용) */
"use client";
import { useEffect, useMemo, useRef, useState } from "react";

export type ComboOption = {
  value: string;
  label: string;
  keywords?: string;
  hint?: string;
  muted?: boolean;
};

/**
 * 검색형 선택 상자. allowCustom 이면 목록에 없는 값도 그대로 입력할 수 있다(기관 직접 입력, 콘텐츠 자동완성).
 * value 는 옵션의 value(또는 직접 입력 문자열)이다.
 */
export function Combobox({
  value,
  onChange,
  options,
  placeholder,
  allowCustom = false,
  disabled,
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  options: ComboOption[];
  placeholder?: string;
  allowCustom?: boolean;
  disabled?: boolean;
  id?: string;
}) {
  const selected = options.find((o) => o.value === value);
  const [text, setText] = useState(
    selected?.label ?? (allowCustom ? value : ""),
  );
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 바깥에서 value 가 바뀌면 표시 텍스트 동기화
    const sel = options.find((o) => o.value === value);
    setText(sel?.label ?? (allowCustom ? value : ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpen(false);
        if (allowCustom) onChange(text.trim());
        else setText(selected?.label ?? "");
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [allowCustom, onChange, selected?.label, text]);

  const filtered = useMemo(() => {
    const q = text.trim().toLowerCase().replace(/\s+/g, "");
    if (!q || (selected && text === selected.label))
      return options.slice(0, 200);
    return options
      .filter((o) =>
        (o.label + " " + (o.keywords ?? ""))
          .toLowerCase()
          .replace(/\s+/g, "")
          .includes(q),
      )
      .slice(0, 200);
  }, [text, options, selected]);

  const pick = (o: ComboOption) => {
    onChange(o.value);
    setText(o.label);
    setOpen(false);
  };

  return (
    <div className="relative" ref={wrapRef}>
      <input
        id={id}
        className="input"
        value={text}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
          setHi(0);
          if (allowCustom) onChange(e.target.value);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setHi((h) => Math.min(h + 1, filtered.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHi((h) => Math.max(h - 1, 0));
          } else if (e.key === "Enter") {
            if (open && filtered[hi]) {
              e.preventDefault();
              pick(filtered[hi]);
            }
          } else if (e.key === "Escape") setOpen(false);
        }}
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <ul
          className="absolute z-30 mt-1 max-h-60 w-full overflow-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg"
          role="listbox"
        >
          {filtered.map((o, i) => (
            <li
              key={o.value}
              role="option"
              aria-selected={o.value === value}
              className={`flex cursor-pointer items-center justify-between px-2.5 py-1.5 text-[13px] ${i === hi ? "bg-brand-50" : ""} ${o.muted ? "text-slate-400" : "text-slate-800"}`}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(o);
              }}
              onMouseEnter={() => setHi(i)}
            >
              <span>{o.label}</span>
              {o.hint && (
                <span className="ml-2 text-[11px] text-slate-400">
                  {o.hint}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
