"use client";

/**
 * Sparkline — mini gráfico de linha inline pra KPIs.
 *
 * Density > decoração (Few). Sem eixos, sem labels, sem grid.
 * Só a tendência. Mostra ascensão/queda em 1 segundo.
 */
interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  stroke?: string;
}

export default function Sparkline({
  data,
  width = 80,
  height = 24,
  stroke = "currentColor",
}: SparklineProps) {
  if (!data || data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const step = width / (data.length - 1);

  const points = data.map((v, i) => {
    const x = i * step;
    const y = height - ((v - min) / range) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ verticalAlign: "middle", display: "inline-block" }}
      aria-hidden="true"
    >
      <polyline
        points={points}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
