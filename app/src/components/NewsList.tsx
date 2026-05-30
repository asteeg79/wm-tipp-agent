import type { NewsItem } from "@wm/shared";
import { useTranslation } from "react-i18next";
import { formatDate } from "../lib/format.js";

const impactColor: Record<string, string> = {
  injury: "bg-red-500/15 text-red-300",
  suspension: "bg-orange-500/15 text-orange-300",
  coach: "bg-blue-500/15 text-blue-300",
  morale: "bg-purple-500/15 text-purple-300",
  none: "bg-slate-700/40 text-slate-400",
};

export function NewsList({ news }: { news: NewsItem[] }) {
  const { t } = useTranslation();
  if (news.length === 0)
    return <p className="text-sm text-slate-500">{t("team.newsEmpty")}</p>;

  return (
    <ul className="space-y-2">
      {news.map((n, i) => (
        <li
          key={i}
          className="rounded-lg border border-slate-800 bg-slate-900/40 p-3"
        >
          <a
            href={n.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium hover:text-emerald-400"
          >
            {n.title}
          </a>
          <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
            <span>{n.source}</span>
            <span>·</span>
            <span>{formatDate(n.publishedAt)}</span>
            {n.impactTag !== "none" && (
              <span
                className={`rounded px-1.5 py-0.5 ${impactColor[n.impactTag] ?? ""}`}
              >
                {n.impactTag}
              </span>
            )}
          </div>
          {n.snippet && (
            <p className="mt-1 text-sm text-slate-400">{n.snippet}</p>
          )}
        </li>
      ))}
    </ul>
  );
}
