/**
 * Skeleton loader — pulse animation neutra.
 *
 * Briefing exige skeleton em todo loading. Padrão.
 */
export default function Skeleton({
  width,
  height = 16,
  style,
}: {
  width?: number | string;
  height?: number | string;
  style?: React.CSSProperties;
}) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: "inline-block",
        background: "var(--border, #e5e7eb)",
        opacity: 0.6,
        borderRadius: "0.25rem",
        width: width ?? "100%",
        height,
        animation: "skeleton-pulse 1.5s ease-in-out infinite",
        ...style,
      }}
    />
  );
}

/** Bloco maior (card). */
export function SkeletonCard({ height = 100 }: { height?: number | string }) {
  return (
    <div
      style={{
        background: "var(--surface, #f3f4f6)",
        border: "1px solid var(--border)",
        borderRadius: "0.75rem",
        padding: "1rem",
        height,
        animation: "skeleton-pulse 1.5s ease-in-out infinite",
      }}
    />
  );
}

/* Adiciona o keyframe via styled component se ainda não existir */
if (typeof document !== "undefined" && !document.getElementById("skeleton-keyframes")) {
  const style = document.createElement("style");
  style.id = "skeleton-keyframes";
  style.textContent = `@keyframes skeleton-pulse { 0%, 100% { opacity: 0.6; } 50% { opacity: 0.3; } }`;
  document.head.appendChild(style);
}
