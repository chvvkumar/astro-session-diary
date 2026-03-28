import { Component, Show, For, createResource, createSignal, createEffect } from "solid-js";
import { A, useParams, useSearchParams } from "@solidjs/router";
import { api } from "../api/client";
import type { TargetDetailResponse, SessionDetail } from "../types";
import SessionAccordionCard from "../components/SessionAccordionCard";
import FilterBadges from "../components/FilterBadges";

function formatHours(seconds: number): string {
  return (seconds / 3600).toFixed(1) + "h";
}

function formatCoord(val: number | null, label: string): string {
  if (val === null) return "";
  return `${label} ${val.toFixed(3)}°`;
}

const TargetDetailPage: Component = () => {
  const params = useParams<{ targetId: string }>();
  const [searchParams] = useSearchParams();

  const [targetDetail] = createResource(
    () => params.targetId,
    (id) => api.getTargetDetail(id),
  );

  const [expandedSessions, setExpandedSessions] = createSignal<Set<string>>(new Set());
  const [sessionCache, setSessionCache] = createSignal<Record<string, SessionDetail>>({});

  const loadSessionDetail = async (date: string) => {
    if (sessionCache()[date]) return;
    const detail = await api.getSessionDetail(params.targetId, date);
    setSessionCache((prev) => ({ ...prev, [date]: detail }));
  };

  // Auto-expand first session or session from query param, and load its data
  createEffect(() => {
    const td = targetDetail();
    if (!td) return;
    // If ?view=sessions, start with all sessions collapsed (overview mode)
    if (searchParams.view === "sessions") return;
    const sessionDate = searchParams.session;
    if (sessionDate && typeof sessionDate === "string") {
      setExpandedSessions(new Set([sessionDate]));
      loadSessionDetail(sessionDate);
    } else if (td.sessions.length > 0) {
      const first = td.sessions[0].session_date;
      setExpandedSessions(new Set([first]));
      loadSessionDetail(first);
    }
  });

  const toggleSession = (date: string) => {
    const wasExpanded = expandedSessions().has(date);
    setExpandedSessions((prev) => {
      const next = new Set(prev);
      if (wasExpanded) next.delete(date);
      else next.add(date);
      return next;
    });
    if (!wasExpanded) {
      loadSessionDetail(date);
    }
  };

  return (
    <div class="min-h-[calc(100vh-57px)] bg-astro-dark">
      {/* Back nav */}
      <div class="px-4 py-3 border-b border-[#2d2d2d]">
        <A href="/" class="text-astro-muted hover:text-white text-sm transition-colors">
          ← Back to Dashboard
        </A>
      </div>

      <Show when={targetDetail.loading}>
        <div class="p-8 text-astro-muted">Loading target data...</div>
      </Show>

      <Show when={targetDetail.error}>
        <div class="p-8 text-red-400">Failed to load target detail</div>
      </Show>

      <Show when={targetDetail()}>
        {(detail) => (
          <>
            {/* Target Hero */}
            <div class="px-6 py-5 border-b border-[#2d2d2d]">
              <div class="flex justify-between items-start">
                <div>
                  <h1 class="text-2xl font-bold text-white">
                    {detail().primary_name}
                  </h1>
                  <div class="text-xs text-astro-muted mt-1 space-x-2">
                    <Show when={detail().object_type}>
                      <span>{detail().object_type}</span>
                      <span>·</span>
                    </Show>
                    <Show when={detail().ra !== null}>
                      <span>{formatCoord(detail().ra, "RA")}</span>
                    </Show>
                    <Show when={detail().dec !== null}>
                      <span>{formatCoord(detail().dec, "Dec")}</span>
                    </Show>
                    <Show when={detail().aliases.length > 1}>
                      <span>· Aliases: {detail().aliases.slice(1).join(", ")}</span>
                    </Show>
                  </div>
                </div>
                <div class="text-right text-xs text-astro-muted">
                  <div>{detail().session_count} sessions</div>
                  <div class="mt-0.5">
                    {detail().first_session_date} → {detail().last_session_date}
                  </div>
                </div>
              </div>

              {/* Cumulative stats bar */}
              <div class="grid grid-cols-5 gap-3 mt-4">
                <div class="bg-astro-panel rounded-lg p-3 text-center">
                  <div class="text-lg font-bold text-blue-400">{formatHours(detail().total_integration_seconds)}</div>
                  <div class="text-[10px] text-astro-muted">Total Integration</div>
                </div>
                <div class="bg-astro-panel rounded-lg p-3 text-center">
                  <div class="text-lg font-bold text-green-400">{detail().total_frames.toLocaleString()}</div>
                  <div class="text-[10px] text-astro-muted">Total Frames</div>
                </div>
                <div class="bg-astro-panel rounded-lg p-3 text-center">
                  <div class="text-lg font-bold text-amber-400">
                    {detail().avg_hfr?.toFixed(2) ?? "—"}
                  </div>
                  <div class="text-[10px] text-astro-muted">Avg HFR</div>
                </div>
                <div class="bg-astro-panel rounded-lg p-3 text-center">
                  <div class="text-lg font-bold text-purple-400">
                    {detail().avg_eccentricity?.toFixed(2) ?? "—"}
                  </div>
                  <div class="text-[10px] text-astro-muted">Avg Eccentricity</div>
                </div>
                <div class="bg-astro-panel rounded-lg p-3 text-center flex flex-col items-center justify-center">
                  <div class="mb-1">
                    <FilterBadges distribution={Object.fromEntries(detail().filters_used.map(f => [f, 0]))} compact />
                  </div>
                  <div class="text-[10px] text-astro-muted">Filters Used</div>
                </div>
              </div>
            </div>

            {/* Session Table */}
            <div class="px-6 py-4">
              <table class="w-full border-collapse">
                <thead>
                  <tr class="text-[10px] text-astro-muted uppercase tracking-wider">
                    <th class="py-2 px-4 text-left font-medium">Date</th>
                    <th class="py-2 px-2 text-right font-medium"></th>
                    <th class="py-2 px-2 text-right font-medium">Frames</th>
                    <th class="py-2 px-2 text-right font-medium">HFR</th>
                    <th class="py-2 px-2 text-right font-medium">Eccentricity</th>
                    <th class="py-2 px-2 text-right font-medium">Filters</th>
                    <th class="py-2 px-2"></th>
                  </tr>
                </thead>
                <tbody>
                  <For each={detail().sessions}>
                    {(session) => (
                      <SessionAccordionCard
                        session={session}
                        isExpanded={expandedSessions().has(session.session_date)}
                        onToggle={() => toggleSession(session.session_date)}
                        detail={sessionCache()[session.session_date] ?? null}
                        autoScroll={searchParams.session === session.session_date}
                      />
                    )}
                  </For>
                </tbody>
              </table>
            </div>
          </>
        )}
      </Show>
    </div>
  );
};

export default TargetDetailPage;
