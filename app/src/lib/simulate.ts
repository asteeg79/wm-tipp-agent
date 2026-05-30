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
        .sort((a, b) => b[1] - a[1] || (rng() - 0.5))
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
