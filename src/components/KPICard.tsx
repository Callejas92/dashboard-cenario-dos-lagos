"use client";

import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface KPICardProps {
  label: string;
  value: string;
  meta?: string;
  status?: "good" | "bad" | "neutral";
  icon?: React.ReactNode;
}

export default function KPICard({ label, value, meta, status = "neutral", icon }: KPICardProps) {
  const statusColor =
    status === "good" ? "#10b981" : status === "bad" ? "#e94560" : "var(--text-muted)";
  const StatusIcon =
    status === "good" ? TrendingUp : status === "bad" ? TrendingDown : Minus;

  return (
    <div className="kpi-card">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-dim)" }}>
          {label}
        </span>
        {icon || <StatusIcon size={14} style={{ color: statusColor }} />}
      </div>
      <div className="text-2xl font-extrabold" style={{ color: "var(--text)" }}>
        {value}
      </div>
      {meta && (
        <div className="text-xs mt-1" style={{ color: statusColor }}>
          Meta: {meta}
        </div>
      )}
    </div>
  );
}
