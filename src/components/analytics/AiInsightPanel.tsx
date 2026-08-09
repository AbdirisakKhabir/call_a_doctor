"use client";

import React, { useCallback, useEffect, useState } from "react";
import { authFetch } from "@/lib/api";

type Props = {
  sectionKey: string;
  /** Filters currently applied to the report; a change invalidates any generated insight. */
  from: string;
  to: string;
  branchId: string;
  /** Blocks generation while the report itself is still loading or failed. */
  reportReady: boolean;
};

type InsightState = {
  text: string;
  model: string;
  generatedAt: string;
};

/** Renders **bold** spans without pulling in a markdown dependency. */
function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, index) => {
    const key = `${keyPrefix}-${index}`;
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={key}>{part.slice(2, -2)}</strong>;
    }
    return <React.Fragment key={key}>{part}</React.Fragment>;
  });
}

/** Minimal renderer for the heading + bullet structure the prompt asks the model to produce. */
function InsightMarkdown({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  const lines = text.split("\n");
  let bullets: string[] = [];

  const flushBullets = () => {
    if (bullets.length === 0) return;
    blocks.push(
      <ul key={`ul-${blocks.length}`} className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-gray-700 dark:text-gray-300">
        {bullets.map((bullet, index) => (
          <li key={index}>{renderInline(bullet, `li-${blocks.length}-${index}`)}</li>
        ))}
      </ul>
    );
    bullets = [];
  };

  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line) {
      flushBullets();
      return;
    }
    const heading = /^#{2,4}\s+(.*)$/.exec(line);
    if (heading) {
      flushBullets();
      blocks.push(
        <h4
          key={`h-${index}`}
          className="mt-5 text-sm font-semibold text-gray-900 first:mt-0 dark:text-white"
        >
          {heading[1]}
        </h4>
      );
      return;
    }
    const bullet = /^[-*•]\s+(.*)$/.exec(line);
    if (bullet) {
      bullets.push(bullet[1]!);
      return;
    }
    const numbered = /^\d+[.)]\s+(.*)$/.exec(line);
    if (numbered) {
      bullets.push(numbered[1]!);
      return;
    }
    flushBullets();
    blocks.push(
      <p key={`p-${index}`} className="mt-2 text-sm leading-relaxed text-gray-700 dark:text-gray-300">
        {renderInline(line, `p-${index}`)}
      </p>
    );
  });
  flushBullets();

  return <div>{blocks}</div>;
}

export default function AiInsightPanel({ sectionKey, from, to, branchId, reportReady }: Props) {
  const [configured, setConfigured] = useState<boolean | null>(null);
  // A narrative describes one specific period, so results are tagged with the filters that
  // produced them and simply stop being shown once the filters move on.
  const filterKey = `${sectionKey}|${from}|${to}|${branchId}`;
  const [result, setResult] = useState<(InsightState & { filterKey: string }) | null>(null);
  const [failure, setFailure] = useState<{ filterKey: string; message: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const insight = result?.filterKey === filterKey ? result : null;
  const error = failure?.filterKey === filterKey ? failure.message : "";

  useEffect(() => {
    let cancelled = false;
    authFetch(`/api/analytics/${sectionKey}/insights`)
      .then(async (res) => {
        if (!res.ok) return;
        const body = (await res.json()) as { configured?: boolean };
        if (!cancelled) setConfigured(Boolean(body.configured));
      })
      .catch(() => {
        if (!cancelled) setConfigured(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sectionKey]);

  const generate = useCallback(async () => {
    setLoading(true);
    setFailure(null);
    try {
      const params = new URLSearchParams({ from, to });
      if (branchId) params.set("branchId", branchId);
      const res = await authFetch(`/api/analytics/${sectionKey}/insights?${params.toString()}`, { method: "POST" });
      const body = (await res.json()) as {
        insight?: string;
        model?: string;
        generatedAt?: string;
        error?: string;
        configured?: boolean;
      };
      if (!res.ok || !body.insight) {
        if (body.configured === false) setConfigured(false);
        setFailure({ filterKey, message: body.error ?? "Could not generate the AI insight." });
        return;
      }
      setResult({
        filterKey,
        text: body.insight,
        model: body.model ?? "ChatGPT",
        generatedAt: body.generatedAt ?? new Date().toISOString(),
      });
    } catch {
      setFailure({ filterKey, message: "Could not reach the server to generate the AI insight." });
    } finally {
      setLoading(false);
    }
  }, [branchId, filterKey, from, sectionKey, to]);

  return (
    <section className="rounded-2xl border border-brand-200 bg-brand-50/50 p-5 dark:border-brand-500/30 dark:bg-brand-500/5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">AI report analysis</h2>
          <p className="mt-1 max-w-2xl text-sm text-gray-600 dark:text-gray-400">
            ChatGPT reads the figures on this page and writes a management commentary: what happened, what looks
            risky, and what to do next.
          </p>
        </div>
        {configured !== false ? (
          <button
            type="button"
            onClick={() => void generate()}
            disabled={loading || !reportReady || configured === null}
            className="h-11 shrink-0 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Analysing…" : insight ? "Regenerate analysis" : "Generate analysis"}
          </button>
        ) : null}
      </div>

      {configured === false ? (
        <div className="mt-4 rounded-xl border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-700 dark:border-warning-500/30 dark:bg-warning-500/10 dark:text-warning-400">
          <p className="font-medium">AI insights are not configured yet.</p>
          <p className="mt-1">
            Add <code className="rounded bg-white/60 px-1 py-0.5 font-mono text-xs dark:bg-black/20">OPENAI_API_KEY</code>{" "}
            to your <code className="rounded bg-white/60 px-1 py-0.5 font-mono text-xs dark:bg-black/20">.env</code> file
            and restart the server. Every chart and table on this page works without it.
          </p>
        </div>
      ) : null}

      {error ? (
        <div className="mt-4 rounded-xl border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700 dark:border-error-900/40 dark:bg-error-500/10 dark:text-error-300">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="mt-4 space-y-2">
          {[0, 1, 2, 3].map((row) => (
            <div
              key={row}
              className="h-3 animate-pulse rounded bg-gray-200 dark:bg-gray-700"
              style={{ width: `${100 - row * 12}%` }}
            />
          ))}
        </div>
      ) : null}

      {insight && !loading ? (
        <div className="mt-4 rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/3">
          <InsightMarkdown text={insight.text} />
          <p className="mt-5 border-t border-gray-100 pt-3 text-xs text-gray-500 dark:border-gray-800 dark:text-gray-400">
            Generated by {insight.model} on {new Date(insight.generatedAt).toLocaleString()}. AI commentary can be
            wrong — check the figures above before acting on it.
          </p>
        </div>
      ) : null}
    </section>
  );
}
