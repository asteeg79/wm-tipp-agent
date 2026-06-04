/**
 * Monte-Carlo-Gruppensimulation aus den 1X2-Wahrscheinlichkeiten der Partien.
 * Vereinfachung: Gruppenphase wird simuliert (Punkte/Rang), K.-o.-Phase
 * approximiert über "Weiterkommen = Top-2 der Gruppe + grobe Titelchance".
 * Läuft komplett clientseitig (kein Server).
 */
import type { IndexFile, Outcome1x2, PredictionsIndex } from "@wm/shared";

export interface SimResult {
  /** teamId → Anteil Simulationen mit Gruppenplatz 1. */
  groupWinner: Map<string, number>;
  /** teamId → Anteil Top-2 (Weiterkommen ins K.o.). */
  advance: Map<string, number>;
  /** teamId → grobe Titelchance. */
  title: Map<string, number>;
}

interface GroupMatch {
  home: string;
  away: string;
  p: Outcome1x2;
}

function pickOutcome(p: Outcome1x2, rng: () => number): 0 | 1 | 2 {
  const r = rng();
  if (r < p.home) return 0; // Heimsieg
  if (r < p.home + p.draw) return 1; // Remis
  return 2; // Auswärtssieg
}

/** Eine einzelne Gruppen-Saison: liefert Punkte/Team. */
function simulateGroup(
  matches: GroupMatch[],
  rng: () => number,
): Map<string, number> {
  const pts = new Map<string, number>();
  const add = (id: string, n: number): void => {
    pts.set(id, (pts.get(id) ?? 0) + n);
  };
  for (const m of matches) {
    add(m.home, 0);
    add(m.away, 0);
    const o = pickOutcome(m.p, rng);
    if (o === 0) add(m.home, 3);
    else if (o === 2) add(m.away, 3);
    else {
      add(m.home, 1);
      add(m.away, 1);
    }
  }
  return pts;
}

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

export function simulateTournament(
  index: IndexFile,
  predIndex: PredictionsIndex,
  runs: number,
): SimResult {
  // Gruppen-Matches mit Wahrscheinlichkeiten sammeln.
  const teamGroup = new Map<string, string>();
  for (const t of index.teams) teamGroup.set(t.id, t.groupId);

  const matchesByGroup = new Map<string, GroupMatch[]>();
  for (const e of predIndex.entries) {
    if (e.stage !== "group" || !e.probabilities) continue;
    const g = teamGroup.get(e.homeTeamId);
    if (!g) continue;
    if (!matchesByGroup.has(g)) matchesByGroup.set(g, []);
    matchesByGroup.get(g)!.push({
      home: e.homeTeamId,
      away: e.awayTeamId,
      p: e.probabilities,
    });
  }

  const groupWinner = new Map<string, number>();
  const advance = new Map<string, number>();
  const title = new Map<string, number>();
  const inc = (m: Map<string, number>, id: string): void => {
    m.set(id, (m.get(id) ?? 0) + 1);
  };

  const rng = makeRng(0x9e3779b9 ^ runs);
  // Elo-Proxy je Team für die grobe K.-o.-Titelgewichtung.
  const strength = new Map<string, number>();
  for (const g of matchesByGroup.values())
    for (const m of g) {
      const aw = avgWin(m.p);
      strength.set(m.home, (strength.get(m.home) ?? 0) + aw.home);
      strength.set(m.away, (strength.get(m.away) ?? 0) + aw.away);
    }

  for (let i = 0; i < runs; i++) {
    const advancers: string[] = [];
    for (const [g, matches] of matchesByGroup) {
      const pts = simulateGroup(matches, rng);
      const ranked = [...pts.entries()]
        // kleiner Zufalls-Tiebreak
        .sort((a, b) => b[1] - a[1] || rng() - 0.5)
        .map(([id]) => id);
      if (ranked[0]) inc(groupWinner, ranked[0]);
      const top2 = ranked.slice(0, 2);
      for (const id of top2) {
        inc(advance, id);
        advancers.push(id);
      }
      void g;
    }
    // Titel: gewichtete Lotterie unter den Weiterkommern (Stärke-Proxy).
    if (advancers.length > 0) {
      const weights = advancers.map((id) => (strength.get(id) ?? 0.5) ** 3);
      const total = weights.reduce((s, w) => s + w, 0);
      let r = rng() * total;
      let champ = advancers[0]!;
      for (let k = 0; k < advancers.length; k++) {
        r -= weights[k]!;
        if (r <= 0) {
          champ = advancers[k]!;
          break;
        }
      }
      inc(title, champ);
    }
  }

  // In Anteile umrechnen.
  const toRate = (m: Map<string, number>): Map<string, number> => {
    const out = new Map<string, number>();
    for (const [id, c] of m) out.set(id, c / runs);
    return out;
  };
  return {
    groupWinner: toRate(groupWinner),
    advance: toRate(advance),
    title: toRate(title),
  };
}

function avgWin(p: Outcome1x2): { home: number; away: number } {
  return { home: p.home + p.draw / 2, away: p.away + p.draw / 2 };
}

/* ════════════════════════════════════════════════════════════════════════
   K.-o.-Baum: EINE simulierte Auslosung (Achtelfinale → Finale)
   Die 16 stärksten Teams (Stärke-Proxy aus den 1X2-Wahrscheinlichkeiten)
   werden nach Standard-Setzliste platziert; jede Partie wird einzeln
   ausgespielt — inkl. plausiblem Ergebnis (im K.-o. immer ein Sieger).
   ════════════════════════════════════════════════════════════════════════ */

export type KoStage = "round16" | "quarter" | "semi" | "final";

export interface BracketMatch {
  a: string;
  b: string;
  winner: string;
  /** Getipptes Ergebnis dieser Partie (Sieger strikt mehr Tore). */
  score: { a: number; b: number };
  /** Siegwahrscheinlichkeit des Siegers (0..1) laut Stärkemodell. */
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

const KO_STAGES: KoStage[] = ["round16", "quarter", "semi", "final"];
// Standard-Setzliste für 16 Plätze: Seed 1 trifft 16, 1 & 2 in versch. Hälften.
const SEED_ORDER = [1, 16, 8, 9, 5, 12, 4, 13, 3, 14, 6, 11, 7, 10, 2, 15];

/** Stärke-Proxy je Team aus den Gruppen-1X2-Wahrscheinlichkeiten. */
function teamStrength(
  index: IndexFile,
  predIndex: PredictionsIndex,
): Map<string, number> {
  const strength = new Map<string, number>();
  for (const t of index.teams) strength.set(t.id, 0.5);
  for (const e of predIndex.entries) {
    if (e.stage !== "group" || !e.probabilities) continue;
    const aw = avgWin(e.probabilities);
    strength.set(e.homeTeamId, (strength.get(e.homeTeamId) ?? 0.5) + aw.home);
    strength.set(e.awayTeamId, (strength.get(e.awayTeamId) ?? 0.5) + aw.away);
  }
  return strength;
}

/**
 * Siegwahrscheinlichkeit von A gegen B aus dem Stärke-Proxy.
 * Power-Gewichtung (Exponent > 1) schärft den Favoriten-Vorteil, damit klar
 * stärkere Teams realistisch dominieren — statt nahe 50/50 zu wirken.
 */
const TIE_EXP = 2.2;
function tieWinProb(sa: number, sb: number): number {
  const wa = Math.pow(Math.max(sa, 0.01), TIE_EXP);
  const wb = Math.pow(Math.max(sb, 0.01), TIE_EXP);
  return wa / (wa + wb);
}

/**
 * Plausibles, deterministisches K.-o.-Ergebnis aus der Siegwahrscheinlichkeit
 * des Favoriten (kein Zufall → reproduzierbar). edge 0 (knapp) .. 1 (klar).
 */
function koScore(pWin: number): { win: number; lose: number } {
  const clamp = (v: number, lo: number, hi: number): number =>
    Math.max(lo, Math.min(hi, v));
  const edge = clamp((pWin - 0.5) * 2, 0, 1);
  const gw = clamp(Math.round(1 + edge * 1.8 + 0.4), 1, 4);
  let gl = clamp(Math.round(0.9 - edge * 1.1 + 0.4), 0, 3);
  if (gl >= gw) gl = gw - 1;
  return { win: gw, lose: gl };
}

/**
 * Deterministischer K.-o.-Baum: die 16 stärksten Teams (Stärke-Proxy aus den
 * Gruppen-1X2) nach Setzliste; je Partie kommt das stärkere Team weiter.
 */
export function simulateBracket(
  index: IndexFile,
  predIndex: PredictionsIndex,
): BracketResult {
  const strength = teamStrength(index, predIndex);

  // 16 stärkste Teams ermitteln und nach Setzliste platzieren.
  const top16 = [...strength.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 16)
    .map(([id]) => id);
  if (top16.length < 16) {
    for (const t of index.teams) {
      if (top16.length >= 16) break;
      if (!top16.includes(t.id)) top16.push(t.id);
    }
  }
  let bracket = SEED_ORDER.map((s) => top16[s - 1]!).filter(Boolean);

  const rounds: BracketRound[] = [];
  let si = 0;
  while (bracket.length > 1) {
    const matches: BracketMatch[] = [];
    const next: string[] = [];
    for (let i = 0; i < bracket.length; i += 2) {
      const a = bracket[i]!;
      const b = bracket[i + 1]!;
      const sa = strength.get(a) ?? 0.5;
      const sb = strength.get(b) ?? 0.5;
      const pA = tieWinProb(sa, sb);
      // Stärkeres Team kommt weiter (deterministisch).
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
