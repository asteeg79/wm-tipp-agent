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

/** Je Gruppe die Teams mit Tabellenrang ≤ Schwelle (wahrscheinliche KO-Teilnehmer). */
function buildKoLikelyByGroup(
  teams: TeamSummary[],
  groupOf: Map<string, string>,
  rankByTeamId: Record<string, number>,
): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const t of teams) {
    const rank = rankByTeamId[t.id];
    const grp = groupOf.get(t.id);
    if (grp && rank !== undefined && rank <= KO_RANK_THRESHOLD) {
      if (!m.has(grp)) m.set(grp, []);
      m.get(grp)!.push(t.id);
    }
  }
  return m;
}

/** Gruppengegner (gleiche Gruppe); markiert Aufgenommene in `seen`. */
function groupOpponents(
  myGroup: string | undefined,
  groups: Group[],
  seen: Set<string>,
): OpponentRef[] {
  const g = myGroup ? groups.find((x) => x.id === myGroup) : undefined;
  const refs: OpponentRef[] = [];
  for (const id of g?.teamIds ?? []) {
    if (!seen.has(id)) {
      refs.push({ teamId: id, stage: "group" });
      seen.add(id);
    }
  }
  return refs;
}

/** Wahrscheinliche K.-o.-Gegner aus ANDEREN Gruppen (überspringt bereits Gesehene). */
function koLikelyOpponents(
  myGroup: string | undefined,
  koLikelyByGroup: Map<string, string[]>,
  seen: Set<string>,
): OpponentRef[] {
  const refs: OpponentRef[] = [];
  for (const [grp, ids] of koLikelyByGroup) {
    if (grp === myGroup) continue;
    for (const id of ids) {
      if (!seen.has(id)) {
        refs.push({ teamId: id, stage: "ko-likely" });
        seen.add(id);
      }
    }
  }
  return refs;
}

/** Liefert pro Team die Liste möglicher Gegner (Gruppe + KO-wahrscheinlich). */
export function deriveOpponentSets(
  teams: TeamSummary[],
  groups: Group[],
  rankByTeamId: Record<string, number>,
): Map<string, OpponentRef[]> {
  const groupOf = new Map<string, string>();
  for (const g of groups) for (const id of g.teamIds) groupOf.set(id, g.id);
  const koLikelyByGroup = buildKoLikelyByGroup(teams, groupOf, rankByTeamId);

  const result = new Map<string, OpponentRef[]>();
  for (const team of teams) {
    const myGroup = groupOf.get(team.id);
    const seen = new Set<string>([team.id]);
    // Gruppengegner ZUERST (füllen `seen`), dann KO-Gegner aus anderen Gruppen.
    const refs = [
      ...groupOpponents(myGroup, groups, seen),
      ...koLikelyOpponents(myGroup, koLikelyByGroup, seen),
    ];
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
