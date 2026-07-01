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
  PredictionIndexEntry,
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
 * Generischer Fallback-Baum aus beliebigen aufgelösten K.-o.-Partien (ohne
 * volles WM-2026-Schema, z. B. Tests): Einstiegsrunde nach Datum, Sieger real
 * bzw. per Elo. `null`, solange keine aufgelösten K.-o.-Partien vorliegen.
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
        const pA = eloWinProb(eloOf(a), eloOf(b));
        const aWins = pA >= 0.5;
        const winProb = aWins ? pA : 1 - pA;
        const { win, lose } = koScore(winProb);
        matches.push({
          a,
          b,
          winner: aWins ? a : b,
          winProb,
          score: { a: aWins ? win : lose, b: aWins ? lose : win },
        });
        next.push(aWins ? a : b);
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

  // Echtes WM-2026-Schema: Baum aus dem Gerüst + realen Partien (Ergebnisse,
  // Weiterkommen bei Elfmeter, sonst Tipp/Elo) und echter Auslosung. Deckt die
  // ganze K.-o.-Phase korrekt ab (echte Paarungen R16+ folgen dem Gerüst).
  if (hasWc2026Structure(index)) {
    const { rounds, champion } = projectBracket(index, predIndex);
    if (rounds.length > 0) return { rounds, champion };
  }

  // Fallback für beliebige aufgelöste K.-o.-Partien ohne WM-Struktur (Tests).
  const real = realBracketRounds(index, predIndex, eloOf);
  if (real) return real;

  // Sonst: K.-o.-Feld aus den Gruppen projizieren, nach Elo setzen.
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

/* ── Echtes WM-2026-K.-o.-Gerüst + Projektion aus dem Gruppenstand ─────────── */

/**
 * Herkunft eines K.-o.-Startplatzes (Sechzehntelfinale):
 *  - `winner`/`runnerUp`: Erst-/Zweitplatzierter einer Gruppe (exakt aus dem
 *    aktuellen/projizierten Tabellenstand ableitbar),
 *  - `third`: bester Dritter aus EINER der erlaubten Gruppen (FIFA verteilt die
 *    8 besten Dritten auf feste Slots; wir projizieren plausibel per Matching).
 */
export type SlotSource =
  | { kind: "winner"; group: string }
  | { kind: "runnerUp"; group: string }
  | { kind: "third"; groups: string[] };

/** Ein Startplatz im Sechzehntelfinale: entweder ein Gruppenslot … */
type Feed = { from: number } | { slot: SlotSource };

interface TieSpec {
  num: number;
  stage: KoStage;
  a: Feed;
  b: Feed;
}

const w = (group: string): Feed => ({ slot: { kind: "winner", group } });
const ru = (group: string): Feed => ({ slot: { kind: "runnerUp", group } });
const th = (...groups: string[]): Feed => ({ slot: { kind: "third", groups } });
const W = (from: number): Feed => ({ from });

/**
 * Offizielles WM-2026-Bracket (Spiel-Nr. 73–104 aus openfootball worldcup.json,
 * Spiel 103 = Platz 3 ausgelassen). Slot-Codes wie „1E" / „2C" / „3 aus
 * A/B/C/D/F" sind fest verdrahtet — nur die konkreten Teams ergeben sich aus
 * dem Tabellenstand.
 */
const WC2026_BRACKET: TieSpec[] = [
  { num: 73, stage: "round32", a: ru("A"), b: ru("B") },
  { num: 74, stage: "round32", a: w("E"), b: th("A", "B", "C", "D", "F") },
  { num: 75, stage: "round32", a: w("F"), b: ru("C") },
  { num: 76, stage: "round32", a: w("C"), b: ru("F") },
  { num: 77, stage: "round32", a: w("I"), b: th("C", "D", "F", "G", "H") },
  { num: 78, stage: "round32", a: ru("E"), b: ru("I") },
  { num: 79, stage: "round32", a: w("A"), b: th("C", "E", "F", "H", "I") },
  { num: 80, stage: "round32", a: w("L"), b: th("E", "H", "I", "J", "K") },
  { num: 81, stage: "round32", a: w("D"), b: th("B", "E", "F", "I", "J") },
  { num: 82, stage: "round32", a: w("G"), b: th("A", "E", "H", "I", "J") },
  { num: 83, stage: "round32", a: ru("K"), b: ru("L") },
  { num: 84, stage: "round32", a: w("H"), b: ru("J") },
  { num: 85, stage: "round32", a: w("B"), b: th("E", "F", "G", "I", "J") },
  { num: 86, stage: "round32", a: w("J"), b: ru("H") },
  { num: 87, stage: "round32", a: w("K"), b: th("D", "E", "I", "J", "L") },
  { num: 88, stage: "round32", a: ru("D"), b: ru("G") },
  { num: 89, stage: "round16", a: W(74), b: W(77) },
  { num: 90, stage: "round16", a: W(73), b: W(75) },
  { num: 91, stage: "round16", a: W(76), b: W(78) },
  { num: 92, stage: "round16", a: W(79), b: W(80) },
  { num: 93, stage: "round16", a: W(83), b: W(84) },
  { num: 94, stage: "round16", a: W(81), b: W(82) },
  { num: 95, stage: "round16", a: W(86), b: W(88) },
  { num: 96, stage: "round16", a: W(85), b: W(87) },
  { num: 97, stage: "quarter", a: W(89), b: W(90) },
  { num: 98, stage: "quarter", a: W(93), b: W(94) },
  { num: 99, stage: "quarter", a: W(91), b: W(92) },
  { num: 100, stage: "quarter", a: W(95), b: W(96) },
  { num: 101, stage: "semi", a: W(97), b: W(98) },
  { num: 102, stage: "semi", a: W(99), b: W(100) },
  { num: 104, stage: "final", a: W(101), b: W(102) },
];

const TIE_BY_NUM = new Map(WC2026_BRACKET.map((t) => [t.num, t]));
/** Alle Gruppen, die das Gerüst erwartet (A…L) → Plausibilitäts-Guard. */
const SKELETON_GROUPS = [
  ...new Set(
    WC2026_BRACKET.flatMap((t) =>
      [t.a, t.b].flatMap((f) =>
        "slot" in f
          ? f.slot.kind === "third"
            ? f.slot.groups
            : [f.slot.group]
          : [],
      ),
    ),
  ),
];

/** Sammelt die Sechzehntelfinal-Nummern im Tiefe-zuerst-Baumlauf (Anzeige). */
function r32Leaves(num: number): number[] {
  const t = TIE_BY_NUM.get(num)!;
  if ("slot" in t.a) return [num];
  return [
    ...r32Leaves((t.a as { from: number }).from),
    ...r32Leaves((t.b as { from: number }).from),
  ];
}
const LEAF_ORDER = r32Leaves(104);
/** Sortier-Schlüssel je Spiel = Position des linkesten R32-Spiels im Baum. */
const orderKey = (num: number): number =>
  LEAF_ORDER.indexOf(r32Leaves(num)[0]!);

export interface ProjectedSide {
  /** Aufgelöstes Team (kann fehlen, falls Slot nicht zuordenbar). */
  teamId: string | null;
  source: SlotSource;
  /** Bei `third`: die Gruppe des projizierten Dritten. */
  thirdGroup?: string;
}

export interface ProjectedR32 {
  num: number;
  a: ProjectedSide;
  b: ProjectedSide;
}

export interface ProjectedBracket {
  rounds: BracketRound[];
  champion: string;
  /** Die 16 Sechzehntelfinal-Paarungen (nach Spiel-Nr.) mit Herkunft. */
  round32: ProjectedR32[];
}

/**
 * Tabelle je Gruppe nach dem AKTUELLEN Stand: nur bereits gespielte Partien
 * zählen (Punkte → Tordiff → Tore, Elo als Tiebreak bei Gleichstand). Bewusst
 * KEINE Durchsimulation der offenen Spiele — sonst würde ein aktueller
 * Gruppenerster, dem das Modell die Restspiele „verliert", als Dritter
 * einsortiert (inkonsistent zur Tabelle auf der Gruppen-Seite).
 */
function currentStandings(
  index: IndexFile,
  predIndex: PredictionsIndex,
): Map<string, Standing[]> {
  const { teamsByGroup, matchesByGroup } = prepare(index, predIndex);
  const eloOf = eloMap(index);
  const out = new Map<string, Standing[]>();
  for (const [g, ids] of teamsByGroup) {
    const tbl = new Map<string, Standing>(
      ids.map((id) => [id, { id, pts: 0, gd: 0, gf: 0 }]),
    );
    for (const m of matchesByGroup.get(g) ?? []) {
      if (!m.result) continue; // nur gespielte Partien
      const home = tbl.get(m.home);
      const away = tbl.get(m.away);
      if (!home || !away) continue;
      const { home: hg, away: ag } = m.result;
      home.gf += hg;
      away.gf += ag;
      home.gd += hg - ag;
      away.gd += ag - hg;
      if (hg > ag) home.pts += 3;
      else if (hg < ag) away.pts += 3;
      else {
        home.pts += 1;
        away.pts += 1;
      }
    }
    out.set(
      g,
      [...tbl.values()].sort(
        (a, b) =>
          cmpStanding(a, b) ||
          eloOf(b.id) - eloOf(a.id) ||
          a.id.localeCompare(b.id),
      ),
    );
  }
  return out;
}

/**
 * Verteilt die besten Gruppendritten per bipartitem Matching (Kuhn) auf ihre
 * erlaubten Slots → Map Spiel-Nr. → teamId. Plausible Projektion, keine exakte
 * FIFA-Kombinationstabelle.
 */
function assignThirds(
  thirds: { id: string; group: string }[],
  slots: { num: number; groups: string[] }[],
): Map<number, string> {
  const thirdOfSlot = new Map<number, string>();
  const slotOfThird = new Map<string, number>();
  const groupsOf = (num: number) => slots.find((s) => s.num === num)!.groups;

  const augment = (
    slotNum: number,
    slotGroups: string[],
    seen: Set<string>,
  ): boolean => {
    for (const candidate of thirds) {
      if (!slotGroups.includes(candidate.group) || seen.has(candidate.id))
        continue;
      seen.add(candidate.id);
      const taken = slotOfThird.get(candidate.id);
      if (taken === undefined || augment(taken, groupsOf(taken), seen)) {
        thirdOfSlot.set(slotNum, candidate.id);
        slotOfThird.set(candidate.id, slotNum);
        return true;
      }
    }
    return false;
  };

  for (const s of slots) augment(s.num, s.groups, new Set());
  return thirdOfSlot;
}

/**
 * Projiziert das vollständige K.-o.-Bracket nach dem ECHTEN WM-2026-Schema aus
 * dem aktuellen Gruppenstand: Sieger/Zweite exakt; die 8 besten Dritten werden
 * plausibel verteilt, SOLANGE die Auslosung noch nicht vorliegt — sobald die
 * echten Sechzehntelfinal-Partien im Index stehen, übernehmen DIESE die Dritten-
 * Zuordnung (sonst zeigte der Tab z. B. GER–Bosnien statt der real ausgelosten
 * Paarung GER–Paraguay). Offene K.-o.-Partien per Elo-Favorit (wie der Baum).
 */
export function projectBracket(
  index: IndexFile,
  predIndex: PredictionsIndex,
): ProjectedBracket {
  const eloOf = eloMap(index);
  const standings = currentStandings(index, predIndex);
  // teamId → Gruppe (für die Herkunft "3. X", auch bei real ausgelosten Dritten).
  const teamGroup = new Map(index.teams.map((tm) => [tm.id, tm.groupId]));

  // Beste 8 Gruppendritte (FIFA-Kriterien, Elo als Tiebreak) — Basis für die
  // PROJEKTION, solange die echte Auslosung fehlt.
  const thirds = [...standings.entries()]
    .map(([group, table]) => (table[2] ? { ...table[2], group } : null))
    .filter((x): x is Standing & { group: string } => !!x)
    .sort((a, b) => cmpStanding(a, b) || eloOf(b.id) - eloOf(a.id))
    .slice(0, 8)
    .map((s) => ({ id: s.id, group: s.group }));

  // Dritt-Slots aus dem Gerüst (inkl. Gruppensieger-Slot der jeweiligen Partie,
  // über den die echte Auslosung gepinnt wird).
  const thirdSlots = WC2026_BRACKET.filter((t) => t.stage === "round32")
    .map((t) => {
      const third = [t.a, t.b].find(
        (x): x is { slot: SlotSource } =>
          "slot" in x && x.slot.kind === "third",
      );
      const winner = [t.a, t.b].find(
        (x): x is { slot: SlotSource } =>
          "slot" in x && x.slot.kind === "winner",
      );
      return third?.slot.kind === "third" && winner?.slot.kind === "winner"
        ? {
            num: t.num,
            groups: third.slot.groups,
            winnerGroup: winner.slot.group,
          }
        : null;
    })
    .filter(
      (x): x is { num: number; groups: string[]; winnerGroup: string } => !!x,
    );

  // Plausible Basis-Zuordnung …
  const thirdByTie = assignThirds(
    thirds,
    thirdSlots.map((s) => ({ num: s.num, groups: s.groups })),
  );
  // … und sobald die echten Sechzehntelfinal-Partien vorliegen, den Dritten je
  // Partie aus dem realen Gegner des (feststehenden) Gruppensiegers ableiten.
  const teamSet = new Set(index.teams.map((tm) => tm.id));
  const realR32 = predIndex.entries.filter(
    (e) =>
      e.stage === "round32" &&
      teamSet.has(e.homeTeamId) &&
      teamSet.has(e.awayTeamId),
  );
  if (realR32.length > 0) {
    const realOpponentOf = (teamId: string): string | null => {
      for (const e of realR32) {
        if (e.homeTeamId === teamId) return e.awayTeamId;
        if (e.awayTeamId === teamId) return e.homeTeamId;
      }
      return null;
    };
    for (const s of thirdSlots) {
      const winnerTeam = standings.get(s.winnerGroup)?.[0]?.id;
      const opp = winnerTeam ? realOpponentOf(winnerTeam) : null;
      if (opp) thirdByTie.set(s.num, opp);
    }
  }

  const teamOfSlot = (num: number, s: SlotSource): string | null => {
    if (s.kind === "winner") return standings.get(s.group)?.[0]?.id ?? null;
    if (s.kind === "runnerUp") return standings.get(s.group)?.[1]?.id ?? null;
    return thirdByTie.get(num) ?? null;
  };
  const sideInfo = (num: number, f: Feed): ProjectedSide | null => {
    if (!("slot" in f)) return null;
    const teamId = teamOfSlot(num, f.slot);
    const tg = teamId ? teamGroup.get(teamId) : undefined;
    return {
      teamId,
      source: f.slot,
      ...(f.slot.kind === "third" && tg ? { thirdGroup: tg } : {}),
    };
  };

  // Echte K.-o.-Partien je Paarung + Teams je Stufe (für den Weiterkommenden
  // bei 90′-Remis: der taucht in einer SPÄTEREN Runde auf = Elfmeter-Sieger).
  const koByPair = new Map<string, PredictionIndexEntry>();
  const teamsAtStage: Array<Set<string>> = KO_STAGES.map(() => new Set());
  for (const e of predIndex.entries) {
    const si = KO_STAGES.indexOf(e.stage as KoStage);
    if (si < 0 || !teamSet.has(e.homeTeamId) || !teamSet.has(e.awayTeamId))
      continue;
    koByPair.set(pairKey(e.homeTeamId, e.awayTeamId), e);
    teamsAtStage[si]!.add(e.homeTeamId);
    teamsAtStage[si]!.add(e.awayTeamId);
  }
  const advancedAfter: Array<Set<string>> = KO_STAGES.map((_, i) => {
    const s = new Set<string>();
    for (let j = i + 1; j < KO_STAGES.length; j++)
      for (const id of teamsAtStage[j]!) s.add(id);
    return s;
  });
  const eloScore = (a: string, b: string) => {
    const pA = eloWinProb(eloOf(a), eloOf(b));
    const aWins = pA >= 0.5;
    const { win, lose } = koScore(aWins ? pA : 1 - pA);
    return {
      winner: aWins ? a : b,
      winProb: aWins ? pA : 1 - pA,
      score: { a: aWins ? win : lose, b: aWins ? lose : win },
    };
  };

  // Baum rekursiv auflösen (memoisiert): echte Ergebnisse/Weiterkommen zuerst,
  // sonst der Weiterkommen-Tipp, sonst Elo.
  const cache = new Map<number, BracketMatch | null>();
  const resolveSide = (num: number, f: Feed): string | null =>
    "from" in f
      ? (resolveTie(f.from)?.winner ?? null)
      : teamOfSlot(num, f.slot);
  const resolveTie = (num: number): BracketMatch | null => {
    if (cache.has(num)) return cache.get(num)!;
    const t = TIE_BY_NUM.get(num)!;
    const a = resolveSide(num, t.a);
    const b = resolveSide(num, t.b);
    if (!a || !b) {
      cache.set(num, null);
      return null;
    }
    const stageIdx = KO_STAGES.indexOf(t.stage);
    const real = koByPair.get(pairKey(a, b));
    const aHome = real?.homeTeamId === a;
    let m: BracketMatch;
    if (real?.actualResult) {
      // Gespielt: entscheidendes Ergebnis → Tor-Sieger; 90′-Remis (Elfmeter) →
      // wer in einer späteren Runde auftaucht, sonst Tipp/Elo.
      const ar = real.actualResult;
      const score = {
        a: aHome ? ar.home : ar.away,
        b: aHome ? ar.away : ar.home,
      };
      let winner: string;
      if (ar.home !== ar.away) {
        winner = ar.home > ar.away ? real.homeTeamId : real.awayTeamId;
      } else {
        const later = advancedAfter[stageIdx]!;
        winner = later.has(a)
          ? a
          : later.has(b)
            ? b
            : real.advance
              ? real.advance.home >= real.advance.away
                ? real.homeTeamId
                : real.awayTeamId
              : eloScore(a, b).winner;
      }
      m = { a, b, winner, winProb: 1, score };
    } else if (real?.advance) {
      // Ungespielt, aber Weiterkommen-Tipp da: 90′-Score + getippter Sieger.
      const homeAdv = real.advance.home >= real.advance.away;
      const ps = real.predictedScore;
      m = {
        a,
        b,
        winner: homeAdv ? real.homeTeamId : real.awayTeamId,
        winProb: homeAdv ? real.advance.home : real.advance.away,
        score: ps
          ? { a: aHome ? ps.home : ps.away, b: aHome ? ps.away : ps.home }
          : eloScore(a, b).score,
      };
    } else {
      m = { a, b, ...eloScore(a, b) };
    }
    cache.set(num, m);
    return m;
  };

  const rounds: BracketRound[] = KO_STAGES.map((stage) => ({
    stage,
    matches: WC2026_BRACKET.filter((t) => t.stage === stage)
      .sort((x, y) => orderKey(x.num) - orderKey(y.num))
      .map((t) => resolveTie(t.num))
      .filter((m): m is BracketMatch => !!m),
  })).filter((r) => r.matches.length > 0);

  const round32: ProjectedR32[] = WC2026_BRACKET.filter(
    (t) => t.stage === "round32",
  )
    .sort((a, b) => a.num - b.num)
    .map((t) => ({
      num: t.num,
      a: sideInfo(t.num, t.a)!,
      b: sideInfo(t.num, t.b)!,
    }));

  return { rounds, champion: resolveTie(104)?.winner ?? "", round32 };
}

/** Hat der Index die volle WM-2026-Gruppenstruktur (A…L)? */
export function hasWc2026Structure(index: IndexFile): boolean {
  const present = new Set(index.teams.map((t) => t.groupId));
  return SKELETON_GROUPS.every((g) => present.has(g));
}
