/**
 * Backtest-CLI: misst die Baseline-Engine auf der Länderspiel-Historie und
 * vergleicht Parameter-Sets. Aufruf: `pnpm --filter @wm/pipeline backtest`.
 *
 * Optional ein Parameter-Sweep über Zeit-Decay-Halbwertszeit (H) und
 * eloToGoalsScale; der beste Satz (niedrigster RPS) wird hervorgehoben.
 */
import { config } from "../../config.js";
import { OpenFootballHistoryProvider } from "../sources/openFootballHistory.js";
import {
  runBacktest,
  paramsFromConfig,
  type BacktestParams,
  type BacktestResult,
} from "./backtest.js";

function historySeasons(years: number): number[] {
  const env = process.env.WM_HISTORY_SEASONS;
  if (env) return env.split(",").map((s) => Number(s.trim())).filter(Number.isInteger);
  const end = new Date().getUTCFullYear();
  const out: number[] = [];
  for (let y = end - years; y <= end; y++) out.push(y);
  return out;
}

async function main(): Promise<void> {
  console.log("[backtest] WM-Tipp-Assistent — Backtest der Baseline-Engine");
  const provider = new OpenFootballHistoryProvider();
  const seasons = historySeasons(config.historyYears);
  const games = await provider.getAllGames(seasons);
  console.log(`[backtest] ${games.length} Länderspiele aus Saisons ${seasons.join(",")}`);

  const base = paramsFromConfig(config);

  // Sweep: H × eloToGoalsScale. Sweep abschaltbar via WM_BACKTEST_SWEEP=0.
  const sweep = process.env.WM_BACKTEST_SWEEP !== "0";
  const candidates: BacktestParams[] = sweep
    ? crossProduct(base, {
        decayHalfLifeDays: [120, 180, 270, 365],
        eloToGoalsScale: [0.0010, 0.0016, 0.0022],
      })
    : [base];

  const results: BacktestResult[] = candidates.map((p) => runBacktest(games, p));
  results.sort((a, b) => (a.rpsMean ?? 9) - (b.rpsMean ?? 9));

  console.log(`\n[backtest] ${results.length} Parameter-Set(s), sortiert nach RPS (niedriger = besser):\n`);
  console.table(
    results.map((r) => ({
      H: r.params.decayHalfLifeDays,
      eloScale: r.params.eloToGoalsScale,
      K: r.params.eloK,
      scored: r.scored,
      "1X2%": pct(r.outcomeRate),
      exact: pct(r.exactScoreRate),
      Brier: num(r.brierMean),
      RPS: num(r.rpsMean),
    })),
  );

  const best = results[0];
  if (best) {
    console.log(
      `\n[backtest] Bester Satz: H=${best.params.decayHalfLifeDays}, ` +
        `eloScale=${best.params.eloToGoalsScale} → RPS ${num(best.rpsMean)}, ` +
        `1X2 ${pct(best.outcomeRate)} (n=${best.scored})`,
    );
    const cur = results.find(
      (r) =>
        r.params.decayHalfLifeDays === base.decayHalfLifeDays &&
        r.params.eloToGoalsScale === base.eloToGoalsScale,
    );
    if (cur && cur !== best) {
      console.log(
        `[backtest] Aktuelle config: H=${base.decayHalfLifeDays}, ` +
          `eloScale=${base.eloToGoalsScale} → RPS ${num(cur.rpsMean)}. ` +
          `Tuning könnte sich lohnen.`,
      );
    }
  }
}

function crossProduct(
  base: BacktestParams,
  grid: Partial<Record<keyof BacktestParams, number[]>>,
): BacktestParams[] {
  let sets: BacktestParams[] = [base];
  for (const [key, values] of Object.entries(grid)) {
    if (!values) continue;
    const next: BacktestParams[] = [];
    for (const s of sets) {
      for (const v of values) {
        next.push({ ...s, [key]: v });
      }
    }
    sets = next;
  }
  return sets;
}

const pct = (x: number | null): string =>
  x === null ? "–" : `${Math.round(x * 100)}%`;
const num = (x: number | null): string => (x === null ? "–" : x.toFixed(4));

main().catch((err) => {
  console.error("[backtest] Fehler:", err);
  process.exitCode = 1;
});
