/**
 * Re-Trigger-Logik (Abschnitt 11.5): entscheidet, ob eine Partie neu vom
 * KI-Ensemble bewertet werden muss. Spart Kosten, indem unveränderte Partien
 * übersprungen werden.
 *
 * Neu bewerten, wenn MINDESTENS eine Bedingung zutrifft:
 *  - noch kein KI-Tipp vorhanden (nur Baseline)
 *  - inputHash des Feature-Bundles hat sich geändert (neues Ergebnis/Daten)
 *  - NEUE materielle News (impactTag != none, erschienen NACH dem letzten Tipp)
 *  - Zeit-Milestone erreicht (T-24h / T-4h vor Anpfiff)
 *
 * Wichtig zur Kosten-Kontrolle: Die News-Bedingung prüft die Aktualität der
 * Schlagzeile gegen den Zeitpunkt des letzten Tipps. Sonst würde dieselbe
 * (tagelang im Feed stehende) Verletzungsmeldung bei JEDEM Lauf eine teure
 * Neubewertung auslösen — der frühere Kostentreiber (ein Spiel wurde 46×
 * neu bewertet).
 */
import type { Match, NewsItem } from "@wm/shared";
import { config } from "../../config.js";

export interface RetriggerDecision {
  shouldEvaluate: boolean;
  reason: string;
}

const MS_PER_HOUR = 3_600_000;

/** Hat der vorhandene Tipp bereits KI-Modelle (nicht nur Baseline)? */
function hasAiTip(match: Match): boolean {
  return !!match.prediction?.models;
}

/** Liegt der Anpfiff innerhalb eines noch nicht „abgehakten" Milestones? */
function milestoneReached(
  match: Match,
  now: Date,
): { reached: boolean; milestone: number | null } {
  const kickoff = new Date(match.date).getTime();
  const hoursUntil = (kickoff - now.getTime()) / MS_PER_HOUR;
  if (hoursUntil < 0) return { reached: false, milestone: null };

  // Letzter Tipp-Zeitpunkt → in welchem Milestone-Fenster war er?
  const lastGen = match.prediction?.generatedAt
    ? new Date(match.prediction.generatedAt).getTime()
    : 0;
  const hoursAtLast = lastGen ? (kickoff - lastGen) / MS_PER_HOUR : Infinity;

  // Sortierte Milestones absteigend (72,24,3). Ein Milestone ist "fällig",
  // wenn wir jetzt darunter sind, der letzte Tipp aber darüber lag.
  for (const m of [...config.reTriggerMilestonesHours].sort((a, b) => b - a)) {
    if (hoursUntil <= m && hoursAtLast > m) {
      return { reached: true, milestone: m };
    }
  }
  return { reached: false, milestone: null };
}

export function decideRetrigger(
  match: Match,
  currentInputHash: string | undefined,
  homeNews: NewsItem[],
  awayNews: NewsItem[],
  now: Date,
): RetriggerDecision {
  if (match.status === "finished") {
    return { shouldEvaluate: false, reason: "Spiel beendet" };
  }
  if (!hasAiTip(match)) {
    return { shouldEvaluate: true, reason: "noch kein KI-Tipp" };
  }
  const prevHash = match.prediction?.inputHash;
  if (currentInputHash && prevHash && currentInputHash !== prevHash) {
    return { shouldEvaluate: true, reason: "Feature-Bundle geändert" };
  }
  // Nur NEUE materielle News (nach dem letzten Tipp erschienen) zählen —
  // sonst löst eine tagelang im Feed stehende Schlagzeile bei jedem Lauf
  // eine Neubewertung aus (der frühere Kostentreiber).
  const lastGenMs = match.prediction?.generatedAt
    ? new Date(match.prediction.generatedAt).getTime()
    : 0;
  const freshMaterial = [...homeNews, ...awayNews].some(
    (n) =>
      n.impactTag !== "none" &&
      new Date(n.publishedAt).getTime() > lastGenMs,
  );
  if (freshMaterial) {
    return { shouldEvaluate: true, reason: "neue materielle News" };
  }
  const { reached, milestone } = milestoneReached(match, now);
  if (reached) {
    return { shouldEvaluate: true, reason: `Zeit-Milestone T-${milestone}h` };
  }
  return { shouldEvaluate: false, reason: "inputHash unverändert" };
}
