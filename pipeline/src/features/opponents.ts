/**
 * Ableitung möglicher WM-Gegner + H2H (Abschnitt 10.1 Schritt 2).
 *
 * - Gruppengegner: sicher (gleiche Gruppe).
 * - K.-o.-Gegner (heuristisch): wahrscheinliche Qualifikanten anderer Gruppen
 *   (Tabellenrang ≤ 2). Liegen keine Ränge vor (vor Turnierstart, openfootball),
 *   werden nur Gruppengegner markiert; in Phase 4 per Elo verfeinerbar.
 */
import type { H2hSummary, Group, TeamSummary } from "@wm/shared";
import type { OpponentStage } from "@wm/shared";
import type { HistoryMatch } from "../sources/types.js";

export interface OpponentRef {
  teamId: string;
  stage: OpponentStage;
}

/** Maximaler Rang, ab dem ein Team als wahrscheinlicher KO-Gegner gilt. */
const KO_RANK_THRESHOLD = 2;

/** Liefert pro Team die Liste möglicher Gegner (Gruppe + KO-wahrscheinlich). */
export function deriveOpponentSets(
  teams: TeamSummary[],
  groups: Group[],
  rankByTeamId: Record<string, number>,
): Map<string, OpponentRef[]> {
  const groupOf = new Map<string, string>();
  for (const g of groups) for (const id of g.teamIds) groupOf.set(id, g.id);

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

    if (myGroup) {
      const g = groups.find((x) => x.id === myGroup);
      for (const id of g?.teamIds ?? []) {
        if (!seen.has(id)) {
          refs.push({ teamId: id, stage: "group" });
          seen.add(id);
        }
      }
    }

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
 * H2H-Zusammenfassung gegen `opponentId` aus der (perspektiv-normalisierten)
 * Historie des Teams.
 */
export function computeH2h(
  opponentId: string,
  history: HistoryMatch[],
): H2hSummary {
  const s: H2hSummary = { played: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 };
  for (const m of history) {
    if (m.opponentId !== opponentId) continue;
    s.played++;
    s.gf += m.goalsFor;
    s.ga += m.goalsAgainst;
    if (m.goalsFor > m.goalsAgainst) s.w++;
    else if (m.goalsFor === m.goalsAgainst) s.d++;
    else s.l++;
  }
  return s;
}
