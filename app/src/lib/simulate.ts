/**
 * Clientseitige Turnier-Simulation für Gruppen- und K.-o.-Chancen.
 *
 * Realismus (gegenüber der früheren 1X2-Lotterie):
 *  - **Echte Ergebnisse**: bereits gespielte Partien fließen mit ihren
 *    tatsächlichen Toren ein; nur offene Partien werden simuliert.
 *  - **Tor-basiert**: offene Partien werden per Poisson aus den erwarteten
 *    Toren (xG) ausgespielt → Tordifferenz/Tore als FIFA-Tiebreaker.
 *  - **WM-2026-Format**: 12 Gruppen à 4, Top-2 + 8 beste Gruppendritte → 32er-
 *    K.-o. (Sechzehntelfinale).
 *  - **Elo-K.-o.**: jede K.-o.-Partie über die Elo-Siegwahrscheinlichkeit.
 *
 * Hinweis: Die K.-o.-Setzung erfolgt nach Stärke (Elo-Seeding), nicht nach der
 * exakten FIFA-Drittplatzierten-Tabelle — als belastbare Wahrscheinlichkeits-
 * Näherung. Alles läuft im Browser (kein Server).
 */
import type {
  IndexFile,
  Outcome1x2,
  PredictionsIndex,
  ScoreLine,
} from "@wm/shared";

export interface SimResult {
  /** teamId → Anteil Simulationen mit Gruppenplatz 1. */
  groupWinner: Map<string, number>;
  /** teamId → Anteil, der die K.-o.-Runde erreicht (Top-2 + bester Dritter). */
  advance: Map<string, number>;
  /** teamId → Titelchance. */
  title: Map<string, number>;
}

const DEFAULT_ELO = 1500;
const MAX_GOALS = 9;

/* ── Hilfsfunktionen ──────────────────────────────────────────────────────── */

/** xorshift-RNG für reproduzierbare, schnelle Simulationen. */
function makeRng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 1_000_000) / 1_000_000;
  };
}

/** Poisson-Stichprobe (Knuth) für eine Toranzahl aus Erwartungswert λ. */
function samplePoisson(lambda: number, rng: () => number): number {
  if (lambda <= 0) return 0;
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng();
  } while (p > L);
  return Math.min(k - 1, MAX_GOALS);
}

/** Elo-Siegwahrscheinlichkeit von A gegen B. */
export function eloWinProb(eloA: number, eloB: number): number {
  return 1 / (1 + 10 ** ((eloB - eloA) / 400));
}

interface SimMatch {
  home: string;
  away: string;
  p: Outcome1x2;
  /** Erwartete Tore (falls vorhanden) für die Tor-Simulation. */
  eg: { home: number; away: number } | null;
  /** Tatsächliches Ergebnis (falls gespielt). */
  result: ScoreLine | null;
}

/** teamId → Elo (Fallback DEFAULT_ELO, falls index noch ohne Elo). */
function eloMap(index: IndexFile): (id: string) => number {
  const m = new Map<string, number>();
  for (const t of index.teams)
    if (typeof t.elo === "number") m.set(t.id, t.elo);
  return (id) => m.get(id) ?? DEFAULT_ELO;
}

/** Gruppen-Teams + Gruppen-Matches aus Index/Prognose aufbereiten. */
function prepare(index: IndexFile, predIndex: PredictionsIndex) {
  const teamGroup = new Map<string, string>();
  const teamsByGroup = new Map<string, string[]>();
  for (const t of index.teams) {
    teamGroup.set(t.id, t.groupId);
    if (!teamsByGroup.has(t.groupId)) teamsByGroup.set(t.groupId, []);
    teamsByGroup.get(t.groupId)!.push(t.id);
  }

  const matchesByGroup = new Map<string, SimMatch[]>();
  for (const e of predIndex.entries) {
    if (e.stage !== "group" || !e.probabilities) continue;
    const g = teamGroup.get(e.homeTeamId);
    if (!g) continue;
    if (!matchesByGroup.has(g)) matchesByGroup.set(g, []);
    matchesByGroup.get(g)!.push({
      home: e.homeTeamId,
      away: e.awayTeamId,
      p: e.probabilities,
      eg: e.expectedGoals ?? null,
      result: e.actualResult ?? null,
    });
  }
  return { teamsByGroup, matchesByGroup };
}

/** Spielt eine Partie aus: echtes Ergebnis bevorzugt, sonst Tore aus xG/1X2. */
function playMatch(m: SimMatch, rng: () => number): { h: number; a: number } {
  if (m.result) return { h: m.result.home, a: m.result.away };
  if (m.eg) {
    return {
      h: samplePoisson(m.eg.home, rng),
      a: samplePoisson(m.eg.away, rng),
    };
  }
  // Fallback ohne xG: grobes Ergebnis aus dem 1X2-Ausgang.
  const r = rng();
  if (r < m.p.home) return { h: 1, a: 0 };
  if (r < m.p.home + m.p.draw) return { h: 1, a: 1 };
  return { h: 0, a: 1 };
}

interface Standing {
  id: string;
  pts: number;
  gd: number;
  gf: number;
}

/** Vergleich nach FIFA-Kriterien: Punkte → Tordifferenz → erzielte Tore. */
function cmpStanding(a: Standing, b: Standing): number {
  return b.pts - a.pts || b.gd - a.gd || b.gf - a.gf;
}

/** Eine Gruppen-Saison → sortierte Tabelle. */
function simulateGroup(
  teamIds: string[],
  matches: SimMatch[],
  rng: (() => number) | null,
  eloOf: (id: string) => number,
): Standing[] {
  const tbl = new Map<string, Standing>();
  for (const id of teamIds) tbl.set(id, { id, pts: 0, gd: 0, gf: 0 });

  for (const m of matches) {
    const home = tbl.get(m.home);
    const away = tbl.get(m.away);
    if (!home || !away) continue;
    // Deterministisch (rng=null): echtes Ergebnis oder gerundete xG.
    const goals = rng
      ? playMatch(m, rng)
      : m.result
        ? { h: m.result.home, a: m.result.away }
        : m.eg
          ? { h: Math.round(m.eg.home), a: Math.round(m.eg.away) }
          : { h: m.p.home >= m.p.away ? 1 : 0, a: m.p.away > m.p.home ? 1 : 0 };
    home.gf += goals.h;
    away.gf += goals.a;
    home.gd += goals.h - goals.a;
    away.gd += goals.a - goals.h;
    if (goals.h > goals.a) home.pts += 3;
    else if (goals.h < goals.a) away.pts += 3;
    else {
      home.pts += 1;
      away.pts += 1;
    }
  }

  const arr = [...tbl.values()];
  // Gleichstand: Zufalls-Tiebreak (Sim) bzw. Elo-Tiebreak (deterministisch).
  arr.sort(
    (a, b) =>
      cmpStanding(a, b) ||
      (rng
        ? rng() - 0.5
        : eloOf(b.id) - eloOf(a.id) || a.id.localeCompare(b.id)),
  );
  return arr;
}

/* ── K.-o.-Setzung (Seeding) ──────────────────────────────────────────────── */

/** Standard-Setzliste: Seed-Nummern 1..n in Bracket-Slot-Reihenfolge. */
export function seedSlots(n: number): number[] {
  let seeds = [1, 2];
  const rounds = Math.log2(n);
  for (let r = 1; r < rounds; r++) {
    const m = seeds.length * 2 + 1;
    const out: number[] = [];
    for (const s of seeds) {
      out.push(s, m - s);
    }
    seeds = out;
  }
  return seeds;
}

/** Größte 2er-Potenz ≤ n. */
function pow2Floor(n: number): number {
  let p = 1;
  while (p * 2 <= n) p *= 2;
  return p;
}

/** Platziert die Weitergekommenen nach Elo in einen Setz-Baum. */
function seedByElo(
  advancers: string[],
  eloOf: (id: string) => number,
): string[] {
  const size = pow2Floor(advancers.length);
  const ranked = [...advancers]
    .sort((a, b) => eloOf(b) - eloOf(a))
    .slice(0, size);
  return seedSlots(size).map((s) => ranked[s - 1]!);
}

/** Ermittelt die 32 Weitergekommenen (Top-2 je Gruppe + 8 beste Dritte). */
function knockoutField(
  teamsByGroup: Map<string, string[]>,
  matchesByGroup: Map<string, SimMatch[]>,
  rng: (() => number) | null,
  eloOf: (id: string) => number,
): { winners: string[]; advancers: string[] } {
  const winners: string[] = [];
  const runnersUp: string[] = [];
  const thirds: Standing[] = [];
  for (const [g, teamIds] of teamsByGroup) {
    const table = simulateGroup(
      teamIds,
      matchesByGroup.get(g) ?? [],
      rng,
      eloOf,
    );
    if (table[0]) winners.push(table[0].id);
    if (table[1]) runnersUp.push(table[1].id);
    if (table[2]) thirds.push(table[2]);
  }
  // 8 beste Gruppendritte.
  const bestThirds = [...thirds]
    .sort(
      (a, b) =>
        cmpStanding(a, b) || (rng ? rng() - 0.5 : eloOf(b.id) - eloOf(a.id)),
    )
    .slice(0, 8)
    .map((s) => s.id);
  return { winners, advancers: [...winners, ...runnersUp, ...bestThirds] };
}

/* ── Echtes K.-o.-Feld (für Baum UND Titelchancen) ────────────────────────── */

interface RealKoField {
  /** Teilnehmer der Einstiegsrunde, flach in Bracket-Reihenfolge (2er-Potenz). */
  entryTeams: string[];
  /** Reales Ergebnis je ungeordnetem Team-Paar (entscheidende Resultate). */
  realResult: Map<
    string,
    { winner: string; home: string; hg: number; ag: number }
  >;
  /** KO_STAGES-Index der Einstiegsrunde (z. B. round32). */
  startIdx: number;
  /** Alle Teilnehmer der Einstiegsrunde (für die advance-Quote). */
  teams: Set<string>;
}

const pairKey = (a: string, b: string): string => [a, b].sort().join("|");

/**
 * Liest das ECHTE K.-o.-Feld aus den (aufgelösten) K.-o.-Partien des Index.
 * `null`, solange keine aufgelösten K.-o.-Partien vorliegen (Platzhalter).
 */
function realKoField(
  index: IndexFile,
  predIndex: PredictionsIndex,
): RealKoField | null {
  const teamSet = new Set(index.teams.map((t) => t.id));
  const byStage = new Map<
    KoStage,
    { home: string; away: string; date: string }[]
  >();
  const realResult: RealKoField["realResult"] = new Map();

  for (const e of predIndex.entries) {
    const st = e.stage as KoStage;
    if (!KO_STAGES.includes(st)) continue; // Gruppe + Platz-3-Spiel ignorieren
    if (!teamSet.has(e.homeTeamId) || !teamSet.has(e.awayTeamId)) continue; // Platzhalter
    if (!byStage.has(st)) byStage.set(st, []);
    byStage.get(st)!.push({
      home: e.homeTeamId,
      away: e.awayTeamId,
      date: e.date,
    });
    const res = e.actualResult;
    if (res && res.home !== res.away) {
      realResult.set(pairKey(e.homeTeamId, e.awayTeamId), {
        winner: res.home > res.away ? e.homeTeamId : e.awayTeamId,
        home: e.homeTeamId,
        hg: res.home,
        ag: res.away,
      });
    }
  }

  const present = KO_STAGES.filter((s) => byStage.has(s));
  if (present.length === 0) return null;
  const entry = [...byStage.get(present[0]!)!].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  const entryTeams = entry.flatMap((m) => [m.home, m.away]);
  // Teilnehmerzahl muss 2er-Potenz sein, sonst lieber die Projektion nutzen.
  if (
    entryTeams.length < 2 ||
    (entryTeams.length & (entryTeams.length - 1)) !== 0
  ) {
    return null;
  }
  return {
    entryTeams,
    realResult,
    startIdx: KO_STAGES.indexOf(present[0]!),
    teams: new Set(entryTeams),
  };
}

/** Stochastische K.-o.-Simulation über das echte Feld (offene Partien per Elo). */
function simulateRealKoChampion(
  field: RealKoField,
  eloOf: (id: string) => number,
  rng: () => number,
): string {
  let bracket = [...field.entryTeams];
  while (bracket.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < bracket.length; i += 2) {
      const a = bracket[i]!;
      const b = bracket[i + 1]!;
      const real = field.realResult.get(pairKey(a, b));
      next.push(
        real ? real.winner : rng() < eloWinProb(eloOf(a), eloOf(b)) ? a : b,
      );
    }
    bracket = next;
  }
  return bracket[0]!;
}

/* ── Monte-Carlo-Titelchancen ─────────────────────────────────────────────── */

export function simulateTournament(
  index: IndexFile,
  predIndex: PredictionsIndex,
  runs: number,
): SimResult {
  const { teamsByGroup, matchesByGroup } = prepare(index, predIndex);
  const eloOf = eloMap(index);
  const rng = makeRng(0x9e3779b9 ^ runs);

  const groupWinner = new Map<string, number>();
  const advance = new Map<string, number>();
  const title = new Map<string, number>();
  const inc = (m: Map<string, number>, id: string): void => {
    m.set(id, (m.get(id) ?? 0) + 1);
  };
  const toRate = (m: Map<string, number>): Map<string, number> => {
    const out = new Map<string, number>();
    for (const [id, c] of m) out.set(id, c / runs);
    return out;
  };

  // Fall A: Echtes K.-o.-Feld vorhanden (Gruppen entschieden) → Gruppensieger
  // und Qualifikanten stehen fest; Titel aus dem realen K.-o.-Feld simulieren
  // (gespielte Partien fix, offene per Elo). So fließen echte K.-o.-Ergebnisse
  // konsistent zum Baum ein (ausgeschiedene Teams → 0 % Titel).
  const field = realKoField(index, predIndex);
  if (field) {
    const { winners } = knockoutField(
      teamsByGroup,
      matchesByGroup,
      null,
      eloOf,
    );
    for (const id of winners) groupWinner.set(id, 1);
    for (const id of field.teams) advance.set(id, 1);
    for (let i = 0; i < runs; i++) {
      inc(title, simulateRealKoChampion(field, eloOf, rng));
    }
    return { groupWinner, advance, title: toRate(title) };
  }

  // Fall B: Noch kein K.-o.-Feld → Gruppen (mit echten Ergebnissen) simulieren,
  // Feld nach Elo setzen und die K.-o.-Phase per Elo ausspielen.
  for (let i = 0; i < runs; i++) {
    const { winners, advancers } = knockoutField(
      teamsByGroup,
      matchesByGroup,
      rng,
      eloOf,
    );
    for (const id of winners) inc(groupWinner, id);
    for (const id of advancers) inc(advance, id);

    let bracket = seedByElo(advancers, eloOf);
    while (bracket.length > 1) {
      const next: string[] = [];
      for (let k = 0; k < bracket.length; k += 2) {
        const a = bracket[k]!;
        const b = bracket[k + 1]!;
        next.push(rng() < eloWinProb(eloOf(a), eloOf(b)) ? a : b);
      }
      bracket = next;
    }
    if (bracket[0]) inc(title, bracket[0]);
  }

  return {
    groupWinner: toRate(groupWinner),
    advance: toRate(advance),
    title: toRate(title),
  };
}

/* ── Deterministischer K.-o.-Baum (Tree-Ansicht) ──────────────────────────── */

export type KoStage = "round32" | "round16" | "quarter" | "semi" | "final";

export interface BracketMatch {
  a: string;
  b: string;
  winner: string;
  score: { a: number; b: number };
  /** Siegwahrscheinlichkeit des Siegers (0..1) laut Elo. */
  winProb: number;
}

export interface BracketRound {
  stage: KoStage;
  matches: BracketMatch[];
}

export interface BracketResult {
  rounds: BracketRound[];
  champion: string;
}

const KO_STAGES: KoStage[] = ["round32", "round16", "quarter", "semi", "final"];

/** Plausibles, deterministisches K.-o.-Ergebnis aus der Elo-Siegwahrsch. */
function koScore(pWin: number): { win: number; lose: number } {
  const edge = Math.max(0, Math.min(1, (pWin - 0.5) * 2)); // 0 knapp .. 1 klar
  const gw = Math.max(1, Math.min(4, Math.round(1 + edge * 1.8 + 0.4)));
  let gl = Math.max(0, Math.min(3, Math.round(0.9 - edge * 1.1 + 0.4)));
  if (gl >= gw) gl = gw - 1;
  return { win: gw, lose: gl };
}

/**
 * Baut den Baum aus den ECHTEN K.-o.-Partien, sobald deren Teilnehmer
 * feststehen (openfootball löst Platzhalter nach der Gruppenphase auf).
 * Gespielte Partien liefern realen Sieger/Score, ungespielte werden per Elo
 * simuliert. `null`, solange keine aufgelösten K.-o.-Partien vorliegen.
 */
function realBracketRounds(
  index: IndexFile,
  predIndex: PredictionsIndex,
  eloOf: (id: string) => number,
): BracketResult | null {
  const field = realKoField(index, predIndex);
  if (!field) return null;
  const { realResult, startIdx } = field;

  let bracket = [...field.entryTeams];
  const rounds: BracketRound[] = [];
  let ri = 0;
  while (bracket.length > 1) {
    const matches: BracketMatch[] = [];
    const next: string[] = [];
    for (let i = 0; i < bracket.length; i += 2) {
      const a = bracket[i]!;
      const b = bracket[i + 1]!;
      const real = realResult.get(pairKey(a, b));
      if (real) {
        // Echtes Ergebnis fließt direkt ein.
        matches.push({
          a,
          b,
          winner: real.winner,
          winProb: eloWinProb(
            eloOf(real.winner),
            eloOf(real.winner === a ? b : a),
          ),
          score: {
            a: a === real.home ? real.hg : real.ag,
            b: b === real.home ? real.hg : real.ag,
          },
        });
        next.push(real.winner);
      } else {
        // Offene Partie → Elo-Favorit.
        const pA = eloWinProb(eloOf(a), eloOf(b));
        const aWins = pA >= 0.5;
        const winner = aWins ? a : b;
        const winProb = aWins ? pA : 1 - pA;
        const { win, lose } = koScore(winProb);
        matches.push({
          a,
          b,
          winner,
          winProb,
          score: { a: aWins ? win : lose, b: aWins ? lose : win },
        });
        next.push(winner);
      }
    }
    rounds.push({ stage: KO_STAGES[startIdx + ri] ?? "final", matches });
    bracket = next;
    ri++;
  }
  return { rounds, champion: bracket[0]! };
}

export function simulateBracket(
  index: IndexFile,
  predIndex: PredictionsIndex,
): BracketResult {
  const eloOf = eloMap(index);

  // 1) Echte K.-o.-Partien nutzen, sobald die Teilnehmer feststehen
  //    (gespielte Ergebnisse fließen sofort ein).
  const real = realBracketRounds(index, predIndex, eloOf);
  if (real) return real;

  // 2) Sonst: K.-o.-Feld aus den (ergebnisbasierten) Gruppen projizieren und
  //    nach Elo setzen.
  const { teamsByGroup, matchesByGroup } = prepare(index, predIndex);
  const { advancers } = knockoutField(
    teamsByGroup,
    matchesByGroup,
    null,
    eloOf,
  );
  let bracket = seedByElo(advancers, eloOf);

  const rounds: BracketRound[] = [];
  let si = KO_STAGES.length - Math.log2(Math.max(2, bracket.length));
  while (bracket.length > 1) {
    const matches: BracketMatch[] = [];
    const next: string[] = [];
    for (let i = 0; i < bracket.length; i += 2) {
      const a = bracket[i]!;
      const b = bracket[i + 1]!;
      const pA = eloWinProb(eloOf(a), eloOf(b));
      const aWins = pA >= 0.5;
      const winner = aWins ? a : b;
      const winProb = aWins ? pA : 1 - pA;
      const { win, lose } = koScore(winProb);
      matches.push({
        a,
        b,
        winner,
        winProb,
        score: { a: aWins ? win : lose, b: aWins ? lose : win },
      });
      next.push(winner);
    }
    rounds.push({ stage: KO_STAGES[si] ?? "final", matches });
    bracket = next;
    si++;
  }

  return { rounds, champion: bracket[0]! };
}
