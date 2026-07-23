/**
 * English display names for DB-stored match strings that may still be entered
 * in Portuguese (legacy admin seeds). Club names identical in both languages
 * need no entry.
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

/** Map a stored match/club/competition name to English for display. */
export function enName(name: string): string {
  return NAME_EN[name] ?? name;
}
