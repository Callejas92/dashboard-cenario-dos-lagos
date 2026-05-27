/**
 * Admin — Fase 5 do redesign.
 *
 * Rota escondida (não aparece no menu principal, mas acessível via gear icon).
 * V1 (futuro): status das integrações, última sync, logs.
 */
import LayoutV2 from "@/components/shared/LayoutV2";

export const metadata = { title: "Admin · Cenário dos Lagos" };

export default function AdminPage() {
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
          Admin em construção
        </h2>
        <p style={{ fontSize: "0.875rem" }}>
          Será entregue na Fase 5: status integrações (Meta, Google, UAU, Eggs, OneDrive), última sync, logs.
        </p>
      </div>
    </LayoutV2>
  );
}
