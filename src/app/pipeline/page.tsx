/**
 * Pipeline — Fase 3 do redesign (em construção).
 */
import LayoutV2 from "@/components/shared/LayoutV2";

export const metadata = { title: "Pipeline · Cenário dos Lagos" };

export default function PipelinePage() {
  return (
    <LayoutV2>
      <div
        style={{
          padding: "2rem",
          textAlign: "center",
          color: "var(--text-dim)",
          background: "var(--surface)",
          border: "1px dashed var(--border)",
          borderRadius: "0.75rem",
        }}
      >
        <h2 style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text)", marginBottom: "0.5rem" }}>
          Pipeline em construção
        </h2>
        <p style={{ fontSize: "0.875rem" }}>
          Será entregue na Fase 3 do redesign (contratos, performance corretor, estoque, financeiro &amp; bônus).
        </p>
        <p style={{ fontSize: "0.8rem", marginTop: "0.75rem" }}>
          Por enquanto, use a <a href="/legacy" style={{ color: "var(--text)", textDecoration: "underline" }}>versão antiga</a>.
        </p>
      </div>
    </LayoutV2>
  );
}
