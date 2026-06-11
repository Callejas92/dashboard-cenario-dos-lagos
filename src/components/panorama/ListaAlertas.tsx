"use client";

/**
 * Linha 5 do Panorama — alertas CONDICIONAIS.
 *
 * Cada card só aparece se a condição for verdadeira:
 *  - 🟡 Bônus a pagar (qtd > 0)
 *  - 🟢/🟡/🔴 Inadimplência (sempre mostra se há parcelas em aberto)
 *  - 🔴 Concentração de risco (corretor >40%)
 *  - 🟡 Contratos parados em "Enviado p/ Assinatura" >7d
 */
import useSWR from "swr";
import AlertCard from "@/components/shared/AlertCard";
import { SkeletonCard } from "@/components/shared/Skeleton";
import { formatBRLCompact, formatPct, formatData } from "@/lib/utils/formatters";
import { corInadimplencia } from "@/lib/utils/cores";
import { isVenda } from "@/lib/constants/projeto";

interface BonusResp {
  summary?: { qtdAPagar?: number; aPagarAgora?: number };
}
interface FinancResp {
  inadimplencia?: { percentualInadimplencia?: number; totalVencido?: number; qtdClientesInadimplentes?: number };
}
interface CrmContratosResp {
  contratos?: { loteId: string; valor: number; status: string; corretor?: { nome?: string }; imobiliaria?: { razaoSocial?: string }; cancelado: boolean; dataContrato?: string }[];
}

const NOMES_IMOBILIARIA = ["EGGS", "GESTÃO", "GESTAO", "INTELIGENCIA EM VENDAS"];

export default function ListaAlertas() {
  const { data: bonus, isLoading: lB } = useSWR<BonusResp>("/api/bonus");
  const { data: financ, isLoading: lF } = useSWR<FinancResp>("/api/uau/financeiro");
  const { data: crm, isLoading: lC } = useSWR<CrmContratosResp>("/api/crm/contratos");

  if (lB && lF && lC) return <SkeletonCard height={100} />;

  const alertas: { node: React.ReactNode; key: string }[] = [];

  // 0. Estagnação de vendas — X dias sem fechar contrato.
  // O "ritmo 30d" verde esconde paradas (um pico antigo segura o número por semanas).
  const vendasFirmes = (crm?.contratos || []).filter((c) => !c.cancelado && isVenda(c.status) && c.dataContrato);
  let ultimaVenda = "";
  for (const c of vendasFirmes) if ((c.dataContrato as string) > ultimaVenda) ultimaVenda = c.dataContrato as string;
  if (ultimaVenda) {
    const diasSemVenda = Math.max(0, Math.floor((Date.now() - new Date(ultimaVenda + "T12:00:00").getTime()) / 86_400_000));
    if (diasSemVenda >= 5) {
      alertas.push({
        key: "estagnacao",
        node: (
          <AlertCard
            severidade={diasSemVenda >= 10 ? "vermelho" : "amarelo"}
            titulo={`${diasSemVenda} dias sem venda`}
            descricao={
              <>
                Última venda assinada em <strong>{formatData(ultimaVenda)}</strong>.
                {diasSemVenda >= 10 ? " Ritmo parado — acionar corretores/imobiliárias." : " Atenção ao ritmo da semana."}
              </>
            }
            acao={{ texto: "Ver corretores ativos/parados", href: "/pipeline?tab=corretores" }}
          />
        ),
      });
    }
  }

  // 1. Bônus a pagar
  if ((bonus?.summary?.qtdAPagar ?? 0) > 0) {
    const qtd = bonus!.summary!.qtdAPagar!;
    const valor = bonus!.summary!.aPagarAgora ?? 0;
    alertas.push({
      key: "bonus",
      node: (
        <AlertCard
          severidade="amarelo"
          titulo={`${qtd} bônus a pagar agora`}
          descricao={
            <>
              {qtd} corretor{qtd > 1 ? "es" : ""} com entrada quitada esperando pagamento.
              Total comprometido: <strong>{formatBRLCompact(valor)}</strong>.
            </>
          }
          acao={{ texto: "Ver na aba Pipeline > Bônus", href: "/pipeline?tab=bonus" }}
        />
      ),
    });
  }

  // 2. Inadimplência (sempre mostra se há vencido)
  const inad = financ?.inadimplencia;
  if (inad && (inad.totalVencido ?? 0) > 0) {
    const pct = inad.percentualInadimplencia ?? 0;
    const sev = corInadimplencia(pct);
    alertas.push({
      key: "inadimplencia",
      node: (
        <AlertCard
          severidade={sev}
          titulo={`Inadimplência: ${formatPct(pct)}`}
          descricao={
            <>
              <strong>{formatBRLCompact(inad.totalVencido ?? 0)}</strong> em parcelas vencidas
              {(inad.qtdClientesInadimplentes ?? 0) > 0 && (
                <> · concentrado em {inad.qtdClientesInadimplentes} cliente{(inad.qtdClientesInadimplentes ?? 0) > 1 ? "s" : ""}</>
              )}
            </>
          }
          acao={{ texto: "Ver detalhamento", href: "/pipeline?tab=financeiro" }}
        />
      ),
    });
  }

  // 3. Concentração de risco em corretor PF
  const contratos = (crm?.contratos || []).filter((c) => !c.cancelado);
  const contadorCorretor = new Map<string, number>();
  for (const c of contratos) {
    const n = c.corretor?.nome?.trim();
    if (!n) continue;
    if (NOMES_IMOBILIARIA.some((excl) => n.toUpperCase().includes(excl))) continue;
    contadorCorretor.set(n, (contadorCorretor.get(n) ?? 0) + 1);
  }
  const totalContratos = Array.from(contadorCorretor.values()).reduce((s, v) => s + v, 0);
  if (totalContratos > 0) {
    const topEntry = Array.from(contadorCorretor.entries()).sort((a, b) => b[1] - a[1])[0];
    if (topEntry) {
      const [nome, qtd] = topEntry;
      const pct = qtd / totalContratos;
      if (pct >= 0.4) {
        alertas.push({
          key: "concentracao",
          node: (
            <AlertCard
              severidade={pct >= 0.6 ? "vermelho" : "amarelo"}
              titulo="Concentração de risco em corretor"
              descricao={
                <>
                  <strong>{nome}</strong> é responsável por {formatPct(pct, { casas: 0 })} das vendas
                  ({qtd} de {totalContratos}).
                </>
              }
              acao={{ texto: "Ver performance por corretor", href: "/pipeline?tab=corretores" }}
            />
          ),
        });
      }
    }
  }

  // 4. Contratos parados em "Enviado p/ Assinatura" >7 dias
  const hoje = Date.now();
  const seteDias = 7 * 24 * 60 * 60 * 1000;
  const parados = contratos.filter((c) => {
    if ((c.status || "").toUpperCase() !== "ENVIADO PARA ASSINATURA") return false;
    if (!c.dataContrato) return false;
    const t = new Date(c.dataContrato + "T12:00:00").getTime();
    return Number.isFinite(t) && (hoje - t) > seteDias;
  });
  if (parados.length > 0) {
    alertas.push({
      key: "parados",
      node: (
        <AlertCard
          severidade="amarelo"
          titulo={`${parados.length} contrato${parados.length > 1 ? "s" : ""} parado${parados.length > 1 ? "s" : ""} >7 dias`}
          descricao={`Em "Enviado p/ Assinatura" sem retorno do cliente. Acompanhar.`}
          acao={{ texto: "Ver na aba Pipeline", href: "/pipeline?estagio=enviado" }}
        />
      ),
    });
  }

  if (alertas.length === 0) {
    return (
      <AlertCard
        severidade="verde"
        titulo="Tudo em dia"
        descricao="Sem alertas pendentes neste momento."
      />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
      {alertas.map((a) => <div key={a.key}>{a.node}</div>)}
    </div>
  );
}
