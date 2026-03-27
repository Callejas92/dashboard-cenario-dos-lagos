"use client";

import { Calendar } from "lucide-react";

interface DateRangeFilterProps {
  startDate: string;
  endDate: string;
  onStartChange: (date: string) => void;
  onEndChange: (date: string) => void;
  onQuickSelect: (days: number | "total") => void;
  activeQuick?: number | "total" | null;
  inline?: boolean; // when true, renders as a compact bar without card wrapper
}

const inputStyle: React.CSSProperties = {
  padding: "0.3rem 0.4rem",
  fontSize: "0.7rem",
  fontWeight: 600,
  borderRadius: "0.375rem",
  background: "var(--surface)",
  color: "var(--text)",
  border: "1px solid var(--border)",
  cursor: "pointer",
  outline: "none",
  width: "120px",
};

const quickButtons: { value: number | "total"; label: string }[] = [
  { value: "total", label: "Total" },
  { value: 7, label: "7d" },
  { value: 14, label: "14d" },
  { value: 30, label: "30d" },
  { value: 60, label: "60d" },
  { value: 90, label: "90d" },
];

export default function DateRangeFilter({
  startDate,
  endDate,
  onStartChange,
  onEndChange,
  onQuickSelect,
  activeQuick,
  inline,
}: DateRangeFilterProps) {
  const formatDisplay = (date: string) => {
    if (!date) return "";
    const d = new Date(date + "T00:00:00");
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  };

  const content = (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Calendar size={13} style={{ color: "var(--text-dim)" }} />
          <span style={{ fontSize: "0.7rem", fontWeight: 600, color: "var(--text-dim)" }}>De:</span>
          <input type="date" value={startDate} onChange={(e) => onStartChange(e.target.value)} style={inputStyle} />
          <span style={{ fontSize: "0.7rem", fontWeight: 600, color: "var(--text-dim)" }}>Ate:</span>
          <input type="date" value={endDate} onChange={(e) => onEndChange(e.target.value)} style={inputStyle} />
        </div>
        <div className="flex items-center gap-1">
          {quickButtons.map((btn) => {
            const isActive = activeQuick === btn.value;
            return (
              <button
                key={String(btn.value)}
                onClick={() => onQuickSelect(btn.value)}
                style={{
                  padding: "0.25rem 0.6rem",
                  fontSize: "0.65rem",
                  fontWeight: 700,
                  borderRadius: "0.375rem",
                  background: isActive ? "#4285f4" : "transparent",
                  color: isActive ? "#fff" : "var(--text-dim)",
                  border: isActive ? "1px solid #4285f4" : "1px solid var(--border)",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                {btn.label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="mt-1 text-center">
        <span style={{ fontSize: "0.65rem", color: "var(--text-dim)" }}>
          {formatDisplay(startDate)} ate {formatDisplay(endDate)}
        </span>
      </div>
    </>
  );

  if (inline) {
    return (
      <div style={{ padding: "0.5rem 0", borderBottom: "1px solid var(--border)", marginBottom: "1rem" }}>
        {content}
      </div>
    );
  }

  return (
    <div className="kpi-card" style={{ padding: "0.75rem 1rem" }}>
      {content}
    </div>
  );
}
