import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useMatch, useTeamsMap } from "../lib/data.js";
import { TeamBadge } from "../components/TeamBadge.js";
import { ProbabilityBar } from "../components/ProbabilityBar.js";
import { ConfidenceBadge } from "../components/ConfidenceBadge.js";
import { formatKickoff } from "../lib/format.js";

export function MatchPage() {
  const { matchId } = useParams();
  const { t } = useTranslation();
  const { data: match, isLoading, isError } = useMatch(matchId);
  const teams = useTeamsMap();

  if (isLoading) return <p className="text-fg-muted">{t("loading")}</p>;
  if (isError || !match) return <p className="text-neg">{t("error")}</p>;

  const r = match.actualResult;
  const pred = match.prediction;
  const fb = match.featureBundle;
  const home = teams.get(match.homeTeamId);
  const away = teams.get(match.awayTeamId);
  const models = pred?.models;
  const hasAi = !!models && (!!models.claude || !!models.chatgpt);
  const lowAgreement = pred?.agreement !== undefined && pred.agreement < 0.7;

  return (
    <div className="space-y-4">
      {/* Kopf: Paarung + Ergebnis/Tipp */}
      <div className="rounded-xl border border-edge bg-surface/40 p-5">
        <div className="text-center text-xs text-fg-faint">
          {formatKickoff(match.date)} ·{" "}
          {match.status === "finished"
            ? t("match.finished")
            : t("match.scheduled")}
        </div>
        <div className="mt-3 flex items-center justify-center gap-4 text-lg font-semibold">
          <div className="flex-1 text-right">
            <TeamBadge team={home} fallbackId={match.homeTeamId} />
          </div>
          <div className="font-mono text-2xl">
            {r
              ? `${r.home}:${r.away}`
              : pred
                ? `${pred.predictedScore.home}:${pred.predictedScore.away}`
                : "–"}
          </div>
          <div className="flex-1 text-left">
            <TeamBadge team={away} fallbackId={match.awayTeamId} />
          </div>
        </div>
        {!r && pred && (
          <div className="mt-1 text-center text-[11px] uppercase tracking-wide text-fg-faint">
            {t("match.tip")}
          </div>
        )}
        <div className="mt-3 text-center text-xs text-fg-faint">
          {t("match.venue")}: {match.venue.city}
          {match.venue.altitude
            ? ` · ${t("match.altitude")} ${match.venue.altitude} m`
            : ""}
        </div>
      </div>

      {/* Prognose */}
      {pred ? (
        <div className="space-y-4 rounded-xl border border-edge bg-surface/40 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold">
              {hasAi ? t("match.aiTip") : t("match.baselineTip")}
            </h3>
            <div className="flex items-center gap-2">
              {lowAgreement && (
                <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-medium text-warn ring-1 ring-inset ring-amber-500/30">
                  ⚠ {t("match.modelsDisagree")}
                </span>
              )}
              <ConfidenceBadge value={pred.confidence} />
            </div>
          </div>

          <div>
            <div className="mb-1 text-xs uppercase tracking-wide text-fg-faint">
              {t("match.probabilities")}
            </div>
            <ProbabilityBar p={pred.probabilities} />
          </div>

          {/* Warum dieser Tipp (keyFactors/risks) */}
          {hasAi && <WhySection models={models!} />}

          {/* Modell-Vergleich Claude vs. ChatGPT */}
          {hasAi && (
            <div className="border-t border-edge pt-3">
              <div className="mb-2 text-xs uppercase tracking-wide text-fg-faint">
                {t("match.modelComparison")}
                {pred.agreement !== undefined && (
                  <span className="ml-2 normal-case text-fg-muted">
                    {t("match.agreement")}: {Math.round(pred.agreement * 100)}%
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <ModelCol label="Claude" m={models!.claude} />
                <ModelCol label="ChatGPT" m={models!.chatgpt} />
              </div>
            </div>
          )}

          {/* Baseline vs. KI + erwartete Tore */}
          {pred.baseline && (
            <div className="border-t border-edge pt-3 text-sm text-fg-muted">
              {hasAi && (
                <div className="mb-1 text-xs uppercase tracking-wide text-fg-faint">
                  {t("match.baselineVsAi")}
                </div>
              )}
              {hasAi && (
                <div className="mb-2">
                  <span className="text-fg-faint">Baseline:</span>{" "}
                  <span className="font-mono text-fg-soft">
                    {pct(pred.baseline.probabilities.home)} /{" "}
                    {pct(pred.baseline.probabilities.draw)} /{" "}
                    {pct(pred.baseline.probabilities.away)}
                  </span>
                </div>
              )}
              {t("match.expectedGoals")}:{" "}
              <span className="font-mono text-fg">
                {pred.baseline.expectedGoals.home.toFixed(2)} :{" "}
                {pred.baseline.expectedGoals.away.toFixed(2)}
              </span>
            </div>
          )}

          {/* Faktoren (Elo/Form) */}
          {fb && (
            <div className="grid grid-cols-2 gap-3 border-t border-edge pt-3 text-sm">
              <FeatureCol label={home?.name ?? match.homeTeamId} f={fb.home} />
              <FeatureCol label={away?.name ?? match.awayTeamId} f={fb.away} />
            </div>
          )}

          {/* Tipp-Verlauf: aktueller Lauf (oben, "jetzt") + frühere Läufe. */}
          {(() => {
            const timeline = [
              {
                generatedAt: pred.generatedAt,
                predictedScore: pred.predictedScore,
                confidence: pred.confidence,
                current: true,
              },
              ...[...match.predictionHistory].reverse().map((h) => ({
                generatedAt: h.generatedAt,
                predictedScore: h.predictedScore,
                confidence: h.confidence,
                current: false,
              })),
            ];
            return (
              <div className="border-t border-edge pt-3">
                <div className="mb-2 text-xs uppercase tracking-wide text-fg-faint">
                  {t("match.timeline")}
                </div>
                <ul className="space-y-1 text-sm">
                  {timeline.map((h, i) => (
                    <li
                      key={i}
                      className={`flex justify-between ${
                        h.current ? "font-semibold text-fg" : "text-fg-muted"
                      }`}
                    >
                      <span>
                        {h.current && <span className="mr-1 text-acc">●</span>}
                        {formatKickoff(h.generatedAt)}
                        {h.current ? ` · ${t("match.timelineNow")}` : ""}
                      </span>
                      <span className="font-mono">
                        {h.predictedScore.home}:{h.predictedScore.away} ·{" "}
                        {Math.round(h.confidence * 100)}%
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })()}

          <p className="border-t border-edge pt-3 text-xs text-fg-faint">
            {pred.rationale ?? t("match.baselineNote")}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-edge-strong bg-surface/30 p-4 text-sm text-fg-muted">
          {t("match.predictionSoon")}
        </div>
      )}

      {/* Buchmacher-Quoten (nur wenn Odds-Quelle aktiv) */}
      {match.market && (
        <div className="space-y-3 rounded-xl border border-edge bg-surface/40 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold">{t("market.title")}</h3>
            <span className="text-[11px] text-fg-faint">
              {match.market.source} · {match.market.bookmakerCount}{" "}
              {t("market.bookmakers")}
            </span>
          </div>

          {/* Dezimalquoten 1 / X / 2 */}
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ["1", match.market.decimal.home],
                ["X", match.market.decimal.draw],
                ["2", match.market.decimal.away],
              ] as const
            ).map(([lbl, od]) => (
              <div
                key={lbl}
                className="rounded-lg border border-edge bg-surface-2 px-2 py-2 text-center"
              >
                <div className="font-mono text-[11px] uppercase tracking-wider text-fg-faint">
                  {lbl}
                </div>
                <div className="font-mono text-lg font-bold text-fg">
                  {od.toFixed(2)}
                </div>
              </div>
            ))}
          </div>

          {/* Implizite Wahrscheinlichkeit (Buchmacher-Marge entfernt) */}
          <div>
            <div className="mb-1 text-xs uppercase tracking-wide text-fg-faint">
              {t("market.implied")}
            </div>
            <ProbabilityBar p={match.market.probabilities} />
          </div>

          {/* Wir vs. Markt je Ausgang */}
          {pred && (
            <div className="border-t border-edge pt-2">
              <div className="mb-1 text-xs uppercase tracking-wide text-fg-faint">
                {t("market.compare")}
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
                {(
                  [
                    ["match.home", pred.probabilities.home, match.market.probabilities.home],
                    ["match.draw", pred.probabilities.draw, match.market.probabilities.draw],
                    ["match.away", pred.probabilities.away, match.market.probabilities.away],
                  ] as const
                ).map(([k, ours, mkt]) => (
                  <div key={k}>
                    <div className="text-fg-faint">{t(k)}</div>
                    <div className="font-mono text-pos">
                      {t("market.us")} {pct(ours)}
                    </div>
                    <div className="font-mono text-fg-muted">
                      {t("market.market")} {pct(mkt)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="text-[10px] leading-snug text-fg-faint">
            {t("market.note")}
          </p>
        </div>
      )}
    </div>
  );
}

const pct = (x: number): string => `${Math.round(x * 100)}%`;

function WhySection({
  models,
}: {
  models: NonNullable<import("@wm/shared").Match["prediction"]>["models"];
}) {
  const { t } = useTranslation();
  const factors = new Set<string>();
  const risks = new Set<string>();
  for (const m of [models?.claude, models?.chatgpt]) {
    m?.keyFactors.forEach((f) => factors.add(f));
    m?.risks.forEach((r) => risks.add(r));
  }
  if (factors.size === 0 && risks.size === 0) return null;
  return (
    <div className="border-t border-edge pt-3">
      <div className="mb-2 text-xs uppercase tracking-wide text-fg-faint">
        {t("match.whyTitle")}
      </div>
      {factors.size > 0 && (
        <div className="mb-2">
          <div className="text-xs font-medium text-pos">
            {t("match.keyFactors")}
          </div>
          <ul className="ml-4 list-disc text-sm text-fg-soft">
            {[...factors].slice(0, 5).map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        </div>
      )}
      {risks.size > 0 && (
        <div>
          <div className="text-xs font-medium text-warn">
            {t("match.risks")}
          </div>
          <ul className="ml-4 list-disc text-sm text-fg-soft">
            {[...risks].slice(0, 4).map((rk, i) => (
              <li key={i}>{rk}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ModelCol({
  label,
  m,
}: {
  label: string;
  m: import("@wm/shared").ModelPrediction | undefined;
}) {
  if (!m)
    return (
      <div className="rounded-md bg-surface/60 p-2 text-fg-faint">
        {label}: –
      </div>
    );
  return (
    <div className="rounded-md bg-surface/60 p-2">
      <div className="font-medium">{label}</div>
      <div className="mt-1 font-mono text-fg-soft">
        {m.predictedScore.home}:{m.predictedScore.away}
      </div>
      <div className="text-xs text-fg-faint">
        {pct(m.probabilities.home)} / {pct(m.probabilities.draw)} /{" "}
        {pct(m.probabilities.away)} · {pct(m.confidence)}
      </div>
    </div>
  );
}

function FeatureCol({
  label,
  f,
}: {
  label: string;
  f: { elo: number; weightedForm: number };
}) {
  const { t } = useTranslation();
  return (
    <div>
      <div className="truncate font-medium">{label}</div>
      <div className="mt-1 flex justify-between text-fg-muted">
        <span>{t("match.elo")}</span>
        <span className="font-mono">{f.elo}</span>
      </div>
      <div className="flex justify-between text-fg-muted">
        <span>{t("match.form")}</span>
        <span className="font-mono">{f.weightedForm.toFixed(2)}</span>
      </div>
    </div>
  );
}
