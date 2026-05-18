# Design — Alertas proativos in-app

> **Status:** APPROVED · **Data:** 2026-05-17 · **Owner:** Rafael Nobre
> **Origem:** notificar quando surge fixture de alto sinal, reaproveitando os sinais cheap já computados. Decisão: in-app, sem canal externo.
> **Escopo:** sub-projeto independente. Toca fixtures/UI + 1 tabela mínima. **Não** toca banca/calibração/scraper/copilot route.

## Problema

`computeFixtureSignals()` (`lib/fixtures/copilot-scan-tools.ts:384`, pura) e os badges com thresholds (`computeBadges()`, `lib/fixtures/badges.ts:44`) já existem e já aparecem no `FixtureCard` da `/fixtures`. Mas não há **proatividade**: nada chama a atenção pro jogo de alto sinal do dia, e os badges são estáticos/indistintos. O usuário precisa garimpar manualmente.

## Decisões (travadas no brainstorm)

1. **Canal: in-app destacado.** Zero infra externa, zero credencial, zero custo.
2. **Avaliação em read-time** (sem job pós-scrape, sem tabela de avaliação) — reusa funções puras já existentes no caminho de query já existente.
3. Persistir só "já visto/dispensado" (tabela mínima) pra o destaque não voltar eternamente.

## Arquitetura

```
lib/alerts/is-high-signal.ts  (puro)
   isHighSignal(signals|badges) → boolean   [regra inicial: ≥2 badges]
        ▲ reusa computeFixtureSignals / computeBadges (já testados)
        │
/  (dashboard home)  → seção "⚡ Destaques do dia": fixtures de hoje (janela BRT)
                        com isHighSignal=true e NÃO dispensadas
/fixtures            → FixtureCard ganha realce mais forte quando isHighSignal
alert_dismissals     → (user_id, fixture_id, dismissed_at)  dispensar = some do destaque
```

**1. `lib/alerts/is-high-signal.ts` — função pura.** `isHighSignal(input): boolean` a partir do resultado de `computeBadges()`/`computeFixtureSignals()`. Regra inicial explícita e isolada (`>= 2 badges`), fácil de ajustar e testar. Sem I/O, sem LLM.

**2. Dashboard `/` — seção "⚡ Destaques do dia".** Server Component: query das fixtures da janela BRT de hoje (reusa o repositório de fixtures já existente — mesma fonte da `/fixtures`), filtra por `isHighSignal` e exclui as presentes em `alert_dismissals` do usuário. Lista compacta (jogo, liga, horário, badges, link pro detalhe). Vazio → não renderiza a seção (sem ruído).

**3. `/fixtures` — realce.** `components/fixtures/fixture-card.tsx` recebe um booleano `highSignal` (derivado no Server Component que já monta a lista) e aplica tratamento visual mais forte (borda/acento — reusa tokens do design system existente; sem novo componente). Badges já renderizados continuam; muda só a ênfase do card.

**4. `alert_dismissals` — tabela mínima.** `(user_id uuid, fixture_id bigint, dismissed_at timestamptz, PRIMARY KEY (user_id, fixture_id))`. RLS por `user_id` (padrão das tabelas de usuário). Botão "dispensar" no item do destaque → Server Action insere a linha → o jogo some da seção (não afeta a `/fixtures`, que só realça). Sem FK rígida pra `fixtures` (fixture é purgada em 3 dias; linha órfã é inócua e pode ser limpa por housekeeping futuro — fora de escopo).

## Data flow

Nenhuma escrita no caminho de scrape. Avaliação 100% em read-time no SSR das páginas que já carregam fixtures — custo: `computeBadges` sobre as ~N fixtures do dia já carregadas (já é feito hoje pra exibir badges; reusamos o resultado, sem query extra). `alert_dismissals` é 1 query leve por carga do dashboard.

## Error handling

- `detail_json` ausente/parcial → `computeBadges` já retorna `[]` (sem badge) → `isHighSignal=false`. Sem erro.
- `alert_dismissals` indisponível → degrada para "mostra todos os destaques" (não esconde valor; sem crash).

## Testes (pirâmide TDD — testes primeiro)

- **Unit (`lib/alerts/is-high-signal.test.ts`):** 0/1/2/3 badges; combinações; entrada sem detail; garante que o threshold é o único ponto de decisão.
- **Integração (dashboard):** seção "Destaques do dia" aparece só com fixtures de alto sinal não-dispensadas; some ao dispensar; vazia → não renderiza. Mock Supabase no padrão `tests/integration/stats-page.test.tsx`.
- **Integração (/fixtures):** card com alto sinal recebe o realce; card normal não. Sem regressão nos badges existentes.
- **Server Action:** dispensar insere em `alert_dismissals` (idempotente por PK) e revalida.

## Riscos / trade-offs

- Threshold inicial (≥2 badges) pode ser muito largo/estreito → é função pura isolada, ajuste é 1 linha + teste; calibração fina é follow-up (e conecta com a feature de calibração no futuro).
- Read-time vs. job: escolhido read-time (YAGNI — sem cron, sem tabela de avaliação); custo desprezível na escala pessoal.

## Fora de escopo

Canal externo (Telegram/email/push), job pós-scrape, histórico de alertas, housekeeping de `alert_dismissals` órfãs, threshold adaptativo. YAGNI / follow-ups.
