/**
 * Datenzugriff: lädt die statischen JSONs aus /data (gleicher Origin) und
 * validiert sie mit den /shared-zod-Schemas. TanStack-Query-Hooks cachen +
 * revalidieren im Hintergrund (StaleWhileRevalidate-Verhalten).
 */
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import {
  IndexFile,
  Match,
  PredictionsIndex,
  Team,
  type IndexFile as IndexFileT,
  type Match as MatchT,
  type PredictionsIndex as PredictionsIndexT,
  type Team as TeamT,
  type TeamSummary,
} from "@wm/shared";

/** Basis-URL inkl. Pages-Base-Path (z. B. "/wm-tipp-agent/"). */
const base = import.meta.env.BASE_URL;

export const dataUrl = (path: string): string => `${base}data/${path}`;

/** Strukturelle Schema-Form (zod-kompatibel), ohne zod-Import im App-Paket. */
interface Parser<T> {
  parse: (data: unknown) => T;
}

async function fetchValidated<T>(url: string, schema: Parser<T>): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} (${url})`);
  return schema.parse(await res.json());
}

export function useIndex(): UseQueryResult<IndexFileT> {
  return useQuery({
    queryKey: ["index"],
    queryFn: () => fetchValidated(dataUrl("index.json"), IndexFile),
  });
}

export function usePredictionsIndex(): UseQueryResult<PredictionsIndexT> {
  return useQuery({
    queryKey: ["predictions-index"],
    queryFn: () =>
      fetchValidated(dataUrl("predictions-index.json"), PredictionsIndex),
  });
}

export function useTeam(teamId: string | undefined): UseQueryResult<TeamT> {
  return useQuery({
    queryKey: ["team", teamId],
    enabled: !!teamId,
    queryFn: () => fetchValidated(dataUrl(`teams/${teamId}.json`), Team),
  });
}

export function useMatch(matchId: string | undefined): UseQueryResult<MatchT> {
  return useQuery({
    queryKey: ["match", matchId],
    enabled: !!matchId,
    queryFn: () => fetchValidated(dataUrl(`matches/${matchId}.json`), Match),
  });
}

/** Lookup teamId → Stammdaten (aus index.json). */
export function useTeamsMap(): Map<string, TeamSummary> {
  const { data } = useIndex();
  const map = new Map<string, TeamSummary>();
  for (const t of data?.teams ?? []) map.set(t.id, t);
  return map;
}
