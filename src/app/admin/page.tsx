/**
 * Admin — Fase 5 do redesign.
 *
 * Rota escondida (não aparece no menu principal, mas acessível via gear icon).
 * MVP: status das integrações + última sincronização (logs ficam pra depois).
 */
import LayoutV2 from "@/components/shared/LayoutV2";
import AdminStatusPanel from "@/components/admin/AdminStatusPanel";

export const metadata = { title: "Admin · Cenário dos Lagos" };

export default function AdminPage() {
  return (
    <LayoutV2>
      <AdminStatusPanel />
    </LayoutV2>
  );
}
