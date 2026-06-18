# Eventos como planejamento — Design

**Data:** 2026-06-18
**Status:** aprovado (aguardando revisão da spec)
**Autor:** Felipe + Claude

## Contexto / Problema

Os eventos (`/api/eventos`, storage no Edge/Blob) viram linhas verticais nos gráficos
de venda (`VendasPorDia`, `CurvaVendasAcumuladas`). Hoje são **retrospectivos**: o
formulário (`EventosManager`) aceita qualquer data, mas:

- O gráfico filtra `eventos.filter(e => dias.some(d => d.dia === e.data))`, e `dias`
  vai **do lançamento até hoje**. Um evento com data futura é **filtrado fora** — some
  do gráfico e da legenda até o dia chegar.
- O campo de data começa **vazio**, exigindo abrir o date picker toda vez.

Resultado: dá pra salvar um evento futuro, mas ele não faz nada visível — não serve
pra planejamento ("já deixei o Passeio de Balão marcado pra dia X").

## Objetivos

1. Surfar eventos **futuros** numa faixa "Próximos eventos" no Panorama.
2. **Alertar** quando um evento está a ≤ 7 dias.
3. Pequenos ajustes no modal: data começa em **hoje**; eventos futuros na lista
   ganham tag "a caminho".

## Não-objetivos (fora de escopo)

- Mudar a API/storage de eventos (já aceita qualquer data).
- Mudar os gráficos — o filtro atual já faz o evento aparecer **no dia certo**
  automaticamente (a "formatura" faixa → marcador é grátis).
- Estender o eixo do gráfico pra frente (linha tracejada "a caminho" no gráfico) —
  ideia válida, adiada.

## Design

Reaproveita o storage e o endpoint existentes. Nenhuma peça toca em API/gráficos.
SWR dedupa a chave `"/api/eventos"`, então os 2 componentes que a leem compartilham
o cache (sem fetch duplicado).

### Helpers puros — `src/lib/utils/eventos.ts` (novo)

Lógica de data isolada e testável (sem React):

- `hojeISO(): string` — data local no formato `YYYY-MM-DD` (mesma convenção do
  `fmtDia` em `VendasPorDia`: `getFullYear/getMonth/getDate` locais).
- `diasAte(iso: string, hoje = hojeISO()): number` — inteiro de dias de `hoje` até
  `iso` (negativo p/ passado). Parse com `T12:00:00` local pra evitar off-by-one de
  fuso/DST; `Math.round(diffMs / 86_400_000)`.
- `rotuloDias(n: number): string` — `0 → "hoje"`, `1 → "amanhã"`, `n>1 → "em N dias"`.
- `eventosFuturos(eventos, hoje = hojeISO()): Evento[]` — `e.data >= hoje`, ordenado
  ascendente por `e.data` (comparação lexical de ISO = cronológica).
- `eventosProximos(eventos, hoje = hojeISO(), limite = DIAS_ALERTA_EVENTO): Evento[]` —
  `hoje <= e.data <= hoje+limite`, ordenado ascendente.

`DIAS_ALERTA_EVENTO = 7` mora em `lib/constants/eventos.ts` (junto de `COR_TIPO_EVENTO`);
`utils/eventos.ts` e `ListaAlertas` importam de lá.

### 1. Faixa "Próximos eventos" — `src/components/panorama/ProximosEventos.tsx` (novo)

- Client component; `useSWR<{ eventos?: Evento[] }>("/api/eventos")`.
- `const futuros = eventosFuturos(data?.eventos ?? [])`.
- **Se `futuros.length === 0` → `return null`** (some por completo; zero poluição).
- Renderiza uma faixa: cabeçalho discreto "Próximos eventos" (ícone calendário, mesmo
  estilo dos outros cabeçalhos do Panorama) + chips, um por evento:
  - bolinha `COR_TIPO_EVENTO[e.tipo]` · data `dd/mm` (reusa `fmtLabel`) · nome ·
    `rotuloDias(diasAte(e.data))`.
  - Evento a ≤ 7 dias: chip destacado (fundo âmbar) — sinaliza o que está chegando.
- Posição: no `panorama/page.tsx`, **logo após `<LinhaKpisGigantes />`** (alta
  visibilidade sem empurrar a manchete de KPIs). Fácil de mover.

### 2. Alerta ≤ 7 dias — editar `src/components/panorama/ListaAlertas.tsx`

- Adicionar `useSWR<{ eventos?: Evento[] }>("/api/eventos")`.
- `for (const e of eventosProximos(eventos))` → `push` de um `AlertCard`:
  - `severidade="amarelo"`, `titulo={`${e.nome} ${rotuloDias(diasAte(e.data))}`}`
    (ex.: "Passeio de Balão em 3 dias"), `descricao` com a data e o tipo.
  - Sem `acao` (ou opcional "ver no Panorama") — é informativo.
- Encaixa no array `alertas` existente (perto do topo, pois é sensível ao tempo). Não
  afeta o fallback "Tudo em dia".

### 3. Ajustes no modal — editar `src/components/panorama/EventosManager.tsx`

- `useState(dataEv)` inicia em `hojeISO()` (hoje inicia `""`); após adicionar, reseta
  pra `hojeISO()` (hoje reseta pra `""`).
- Na lista de eventos, item com `e.data > hojeISO()` ganha um pill discreto
  "a caminho" (pra não parecer que sumiu — ele ainda não está no gráfico).

## Comportamento / edge cases

- `rotuloDias`: 0 = "hoje", 1 = "amanhã", senão "em N dias".
- Evento **hoje**: aparece na faixa ("hoje") e também no gráfico (hoje ∈ `dias`).
- Evento `id="lancamento"` (fixo, passado) nunca entra em próximos. OK.
- Fuso: tudo em data local, consistente com o resto do app.
- Faixa e alerta leem a mesma chave SWR — atualizam juntos ao cadastrar/remover
  (o `mutate` do modal já propaga).

## Testes

- **Vitest (unit, helpers puros)** em `src/lib/utils/eventos.test.ts`:
  `diasAte` (passado/hoje/amanhã/futuro), `rotuloDias`, `eventosFuturos`
  (filtra passado, ordena), `eventosProximos` (limite 7, inclui hoje e o 7º dia,
  exclui 8º). Passar `hoje` fixo nos testes (determinístico).
- **Verificação manual:** cadastrar evento futuro → conferir faixa no Panorama +
  alerta quando ≤ 7 dias + tag "a caminho" no modal; quando a data chega, vira linha
  no gráfico (comportamento atual, inalterado).

## Arquivos

| Arquivo | Ação |
|---|---|
| `src/lib/constants/eventos.ts` | editar — adicionar `DIAS_ALERTA_EVENTO = 7` |
| `src/lib/utils/eventos.ts` | novo — helpers puros de data/filtro |
| `src/lib/utils/eventos.test.ts` | novo — testes vitest dos helpers |
| `src/components/panorama/ProximosEventos.tsx` | novo — faixa |
| `src/app/panorama/page.tsx` | editar — inserir `<ProximosEventos />` após KPIs |
| `src/components/panorama/ListaAlertas.tsx` | editar — bloco de alerta ≤ 7 dias |
| `src/components/panorama/EventosManager.tsx` | editar — data default hoje + tag "a caminho" |
