/**
 * EN display names for DB-stored match strings. Matches are seeded/admin-entered
 * in Portuguese (the canonical product language); the EN tab maps known names
 * and falls back to the stored string. Club names (Flamengo, Fluminense…) are
 * identical in both languages and don't need entries.
 */
const NAME_EN: Record<string, string> = {
  Espanha: "Spain",
  Inglaterra: "England",
  Croácia: "Croatia",
  França: "France",
  Alemanha: "Germany",
  Itália: "Italy",
  "Copa do Mundo — Final": "World Cup — Final",
  "Copa do Mundo": "World Cup",
  Brasileirão: "Brasileirão",
  "Brasileirão — Rodada 19": "Brasileirão — Round 19",
  "Brasileirão — Rodada 20": "Brasileirão — Round 20",
  Libertadores: "Libertadores",
  "Aquecimento — Copa do Mundo": "Warm-up — World Cup",
};

export function enName(name: string): string {
  return NAME_EN[name] ?? name;
}
