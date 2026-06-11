import { useTranslation } from "react-i18next";
import type { AccuracyAggregate, ModelComparison } from "@wm/shared";
import { usePredictionsIndex, useTeamsMap } from "../lib/data.js";
import { formatDecimal, formatPercent } from "../lib/format.js";
import { StatCard } from "../components/StatCard.js";
import { TeamBadge } from "../components/TeamBadge.js";

const MODEL_LABELS = { claude: "Claude", chatgpt: "ChatGPT" } as const;

/** Karte eines Einzelmodells im Vergleich (Claude bzw. ChatGPT). */
function ModelCard({
  model,
  agg,
  leads,
}: {
  model: keyof typeof MODEL_LABELS;
  agg: AccuracyAggregate;
  leads: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div
      className={`rounded-xl border bg-surface/40 p-4 ${
        leads ? "border-acc/60" : "border-edge"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <h4 className="font-semibold">{MODEL_LABELS[model]}</h4>
        {leads && (
          <span className="rounded-full bg-acc/15 px-2 py-0.5 text-xs font-medium text-acc">
            {t("accuracy.models.leads")}
          </span>
        )}
      </div>
      <p className="mt-0.5 text-xs text-fg-faint">
        {agg.finishedCount} {t("accuracy.models.rated")}
      </p>
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
        <div>
          <dt className="text-xs text-fg-muted">{t("accuracy.outcomeRate")}</dt>
          <dd className="font-mono font-semibold">
            {formatPercent(agg.outcomeRate)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-fg-muted">{t("accuracy.exactRate")}</dt>
          <dd className="font-mono font-semibold">
            {formatPercent(agg.exactScoreRate)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-fg-muted">{t("accuracy.rps")}</dt>
          <dd className="font-mono font-semibold">
            {formatDecimal(agg.rpsMean)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-fg-muted">{t("accuracy.brier")}</dt>
          <dd className="font-mono font-semibold">
            {formatDecimal(agg.brierMean)}
          </dd>
        </div>
      </dl>
    </div>
  );
}

/** Abschnitt „Modell-Vergleich" — mit eigenem Leer-Zustand vor WM-Start. */
function ModelComparisonSection({ cmp }: { cmp: ModelComparison | undefined }) {
  const { t } = useTranslation();
  const hasData =
    !!cmp && (cmp.claude.finishedCount > 0 || cmp.chatgpt.finishedCount > 0);

  // Führend = besserer (niedrigerer) RPS; nur küren, wenn beide messbar sind.
  const leader =
    hasData && cmp.claude.rpsMean !== null && cmp.chatgpt.rpsMean !== null
      ? cmp.claude.rpsMean < cmp.chatgpt.rpsMean
        ? "claude"
        : cmp.chatgpt.rpsMean < cmp.claude.rpsMean
          ? "chatgpt"
          : null
      : null;

  return (
    <div>
      <h3 className="mb-1 font-semibold">{t("accuracy.models.title")}</h3>
      <p className="mb-2 text-sm text-fg-muted">{t("accuracy.models.intro")}</p>
      {!hasData ? (
        <div className="rounded-xl border border-dashed border-edge-strong bg-surface/30 p-6 text-fg-muted">
          {t("accuracy.models.none")}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <ModelCard
              model="claude"
              agg={cmp.claude}
              leads={leader === "claude"}
            />
            <ModelCard
              model="chatgpt"
              agg={cmp.chatgpt}
              leads={leader === "chatgpt"}
            />
          </div>
          {cmp.weights ? (
            <div className="rounded-xl border border-edge bg-surface/40 p-4">
              <p className="mb-2 text-xs text-fg-muted">
                {t("accuracy.models.weights")}
              </p>
              <div className="flex h-3 overflow-hidden rounded-full">
                <div
                  className="bg-acc"
                  style={{ width: `${cmp.weights.claude * 100}%` }}
                />
                <div
                  className="bg-info"
                  style={{ width: `${cmp.weights.chatgpt * 100}%` }}
                />
              </div>
              <div className="mt-1 flex justify-between text-xs">
                <span>Claude {formatPercent(cmp.weights.claude)}</span>
                <span>ChatGPT {formatPercent(cmp.weights.chatgpt)}</span>
              </div>
            </div>
          ) : (
            <p className="text-xs text-fg-faint">
              {t("accuracy.models.weightsPending")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function AccuracyPage() {
  const { t } = useTranslation();
  const { data, isLoading, isError } = usePredictionsIndex();
  const teams = useTeamsMap();

  if (isLoading) return <p className="text-fg-muted">{t("loading")}</p>;
  if (isError || !data) return <p className="text-neg">{t("error")}</p>;

  const agg = data.aggregate;

  const finishedEntries = data.entries
    .filter((e) => e.actualResult && e.accuracy)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 20);

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">{t("accuracy.title")}</h2>
        <p className="mt-1 text-sm text-fg-muted">{t("accuracy.intro")}</p>
      </div>

      {agg.finishedCount === 0 ? (
        <>
          <div className="rounded-xl border border-dashed border-edge-strong bg-surface/30 p-6 text-fg-muted">
            {t("accuracy.none")}
          </div>
          <ModelComparisonSection cmp={data.modelComparison} />
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <StatCard
              label={t("accuracy.finished")}
              value={String(agg.finishedCount)}
            />
            <StatCard
              label={t("accuracy.outcomeRate")}
              value={formatPercent(agg.outcomeRate)}
              accent="emerald"
            />
            <StatCard
              label={t("accuracy.exactRate")}
              value={formatPercent(agg.exactScoreRate)}
              accent="sky"
            />
            <StatCard
              label={t("accuracy.brier")}
              value={formatDecimal(agg.brierMean)}
              hint={t("accuracy.lower")}
              accent="amber"
            />
            <StatCard
              label={t("accuracy.rps")}
              value={formatDecimal(agg.rpsMean)}
              hint={t("accuracy.lower")}
              accent="amber"
            />
          </div>

          <ModelComparisonSection cmp={data.modelComparison} />

          <div>
            <h3 className="mb-2 font-semibold">{t("accuracy.recent")}</h3>
            <ul className="divide-y divide-edge/70 rounded-xl border border-edge bg-surface/40">
              {finishedEntries.map((e) => {
                const a = e.accuracy!;
                return (
                  <li
                    key={e.matchId}
                    className="flex items-center gap-2 px-3 py-2 text-sm"
                  >
                    <span className="min-w-0 flex-1 truncate text-right">
                      <TeamBadge
                        team={teams.get(e.homeTeamId)}
                        fallbackId={e.homeTeamId}
                        link={false}
                      />
                    </span>
                    <span className="shrink-0 font-mono">
                      {e.actualResult!.home}:{e.actualResult!.away}
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      <TeamBadge
                        team={teams.get(e.awayTeamId)}
                        fallbackId={e.awayTeamId}
                        link={false}
                      />
                    </span>
                    <span className="shrink-0">
                      {a.exactScoreHit ? (
                        <span
                          className="text-pos"
                          title={t("accuracy.exactRate")}
                        >
                          ★
                        </span>
                      ) : a.outcomeHit ? (
                        <span
                          className="text-warn"
                          title={t("accuracy.outcomeRate")}
                        >
                          ✓
                        </span>
                      ) : (
                        <span className="text-neg">✗</span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}
    </section>
  );
}
