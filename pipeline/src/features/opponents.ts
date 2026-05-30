/**
 * Ableitung möglicher WM-Gegner + H2H (Abschnitt 10.1 Schritt 2).
 *
 * - Gruppengegner: sicher (gleiche Gruppe).
 * - K.-o.-Gegner (heuristisch, Phase 1): wahrscheinliche Qualifikanten anderer
 *   Gruppen, definiert als Teams mit Tabellenrang ≤ 2 in ihrer Gruppe. Im
 *   48er-Feld (Top 2 + 8 beste Dritte) sind das die realistisch im K.o.
 *   erreichbaren Gegner. Bei fehlenden echten Rängen (vor Turnierstart) dient
 *   der Seeding-/API-Rang als Proxy; in Phase 4 per Elo verfeinerbar.
 */
import type { H2hSummary, Group, TeamSummary } from "@wm/shared";
import type { OpponentStage } from "@wm/shared";
import type { NormalizedFixture } from "../sources/types.js";

export interface OpponentRef {
  teamId: string;
  stage: OpponentStage;
}

/** Maximaler Rang, ab dem ein Team als wahrscheinlicher KO-Gegner gilt. */
const KO_RANK_THRESHOLD = 2;

/**
 * Liefert pro Team die Liste möglicher Gegner (Gruppe + KO-wahrscheinlich).
 */
export function deriveOpponentSets(
  teams: TeamSummary[],
  groups: Group[],
  rankByTeamId: Record<string, number>,
): Map<string, OpponentRef[]> {
  const groupOf = new Map<string, string>();
  for (const g of groups) for (const id of g.teamIds) groupOf.set(id, g.id);

  // KO-wahrscheinliche Teams (rang ≤ Schwelle), gruppiert nach Gruppe.
  const koLikelyByGroup = new Map<string, string[]>();
  for (const t of teams) {
    const rank = rankByTeamId[t.id];
    const grp = groupOf.get(t.id);
    if (grp && rank !== undefined && rank <= KO_RANK_THRESHOLD) {
      if (!koLikelyByGroup.has(grp)) koLikelyByGroup.set(grp, []);
      koLikelyByGroup.get(grp)!.push(t.id);
    }
  }

  const result = new Map<string, OpponentRef[]>();
  for (const team of teams) {
    const myGroup = groupOf.get(team.id);
    const refs: OpponentRef[] = [];
    const seen = new Set<string>([team.id]);

    // Gruppengegner (sicher).
    if (myGroup) {
      const g = groups.find((x) => x.id === myGroup);
      for (const id of g?.teamIds ?? []) {
        if (!seen.has(id)) {
          refs.push({ teamId: id, stage: "group" });
          seen.add(id);
        }
      }
    }

    // KO-wahrscheinliche Gegner aus anderen Gruppen.
    for (const [grp, ids] of koLikelyByGroup) {
      if (grp === myGroup) continue;
      for (const id of ids) {
        if (!seen.has(id)) {
          refs.push({ teamId: id, stage: "ko-likely" });
          seen.add(id);
        }
      }
    }

    result.set(team.id, refs);
  }
  return result;
}

/**
 * H2H-Zusammenfassung aus Sicht von `teamId` gegen `opponentId`, berechnet aus
 * den (bereits geladenen) Spielen des Teams — funktioniert auch bei partiellen
 * Läufen, da nur die eigenen Fixtures nötig sind.
 */
export function computeH2h(
  teamId: string,
  opponentId: string,
  fixtures: NormalizedFixture[],
): H2hSummary {
  const s: H2hSummary = { played: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 };
  for (const fx of fixtures) {
    const isHome = fx.homeTeamId === teamId;
    const isAway = fx.awayTeamId === teamId;
    if (!isHome && !isAway) continue;
    const other = isHome ? fx.awayTeamId : fx.homeTeamId;
    if (other !== opponentId) continue;

    const gf = isHome ? fx.goalsHome : fx.goalsAway;
    const ga = isHome ? fx.goalsAway : fx.goalsHome;
    s.played++;
    s.gf += gf;
    s.ga += ga;
    if (gf > ga) s.w++;
    else if (gf === ga) s.d++;
    else s.l++;
  }
  return s;
}
