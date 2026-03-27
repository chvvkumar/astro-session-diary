import { Component, For, Show, createSignal, onMount } from "solid-js";
import { api } from "../../api/client";
import { showToast } from "../Toast";
import type { MergeCandidateResponse, MergedTargetResponse } from "../../types";

export const MergesTab: Component = () => {
  const [candidates, setCandidates] = createSignal<MergeCandidateResponse[]>([]);
  const [merged, setMerged] = createSignal<MergedTargetResponse[]>([]);
  const [detecting, setDetecting] = createSignal(false);
  const [view, setView] = createSignal<"suggestions" | "merged">("suggestions");

  const refresh = async () => {
    try {
      const [c, m] = await Promise.all([
        api.getMergeCandidates(),
        api.getMergedTargets(),
      ]);
      setCandidates(c);
      setMerged(m);
    } catch {
      // Non-blocking
    }
  };

  onMount(refresh);

  const handleMerge = async (candidate: MergeCandidateResponse) => {
    try {
      await api.mergeTargets(
        candidate.suggested_target_id,
        undefined,
        candidate.source_name,
      );
      showToast(`Merged "${candidate.source_name}" into "${candidate.suggested_target_name}"`);
      await refresh();
    } catch {
      showToast("Merge failed", "error");
    }
  };

  const handleDismiss = async (candidate: MergeCandidateResponse) => {
    try {
      await api.dismissMergeCandidate(candidate.id);
      setCandidates((prev) => prev.filter((c) => c.id !== candidate.id));
    } catch {
      showToast("Dismiss failed", "error");
    }
  };

  const handleUnmerge = async (target: MergedTargetResponse) => {
    try {
      await api.unmergeTarget(target.id);
      showToast(`Unmerged "${target.primary_name}"`);
      await refresh();
    } catch {
      showToast("Unmerge failed", "error");
    }
  };

  const handleDetect = async () => {
    setDetecting(true);
    try {
      await api.triggerDuplicateDetection();
      showToast("Duplicate detection started - results will appear shortly");
      setTimeout(refresh, 5000);
    } catch {
      showToast("Failed to start detection", "error");
    } finally {
      setDetecting(false);
    }
  };

  return (
    <div class="space-y-6">
      <div class="flex gap-2 items-center">
        <button
          onClick={() => setView("suggestions")}
          class={`px-3 py-1 text-sm rounded ${
            view() === "suggestions" ? "bg-astro-accent text-white" : "bg-gray-700 text-astro-muted"
          }`}
        >
          Suggestions ({candidates().length})
        </button>
        <button
          onClick={() => setView("merged")}
          class={`px-3 py-1 text-sm rounded ${
            view() === "merged" ? "bg-astro-accent text-white" : "bg-gray-700 text-astro-muted"
          }`}
        >
          Merged ({merged().length})
        </button>
        <button
          onClick={handleDetect}
          disabled={detecting()}
          class="ml-auto px-3 py-1 text-sm bg-gray-700 text-astro-muted hover:text-white rounded disabled:opacity-50"
        >
          {detecting() ? "Detecting..." : "Run Detection"}
        </button>
      </div>

      <Show when={view() === "suggestions"}>
        <Show
          when={candidates().length > 0}
          fallback={<p class="text-sm text-astro-muted">No pending suggestions. Run detection to scan for duplicates.</p>}
        >
          <div class="space-y-2">
            <For each={candidates()}>
              {(c) => (
                <div class="flex items-center justify-between p-3 bg-astro-dark border border-gray-700 rounded">
                  <div class="flex-1">
                    <span class="text-white text-sm font-medium">{c.source_name}</span>
                    <span class="text-astro-muted text-xs mx-2">&rarr;</span>
                    <span class="text-astro-accent text-sm">{c.suggested_target_name}</span>
                    <div class="text-xs text-astro-muted mt-0.5">
                      {c.method === "simbad" ? "SIMBAD confirmed" : `${Math.round(c.similarity_score * 100)}% match`}
                      {" \u00b7 "}{c.source_image_count} images
                    </div>
                  </div>
                  <div class="flex gap-2">
                    <button
                      onClick={() => handleMerge(c)}
                      class="px-2 py-1 text-xs bg-green-700 text-white rounded hover:bg-green-600"
                    >
                      Merge
                    </button>
                    <button
                      onClick={() => handleDismiss(c)}
                      class="px-2 py-1 text-xs bg-gray-600 text-astro-muted rounded hover:text-white"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              )}
            </For>
          </div>
        </Show>
      </Show>

      <Show when={view() === "merged"}>
        <Show
          when={merged().length > 0}
          fallback={<p class="text-sm text-astro-muted">No merged targets yet.</p>}
        >
          <div class="space-y-2">
            <For each={merged()}>
              {(m) => (
                <div class="flex items-center justify-between p-3 bg-astro-dark border border-gray-700 rounded">
                  <div class="flex-1">
                    <span class="text-astro-muted text-sm">{m.primary_name}</span>
                    <span class="text-astro-muted text-xs mx-2">&larr; merged into &rarr;</span>
                    <span class="text-white text-sm font-medium">{m.merged_into_name}</span>
                    <div class="text-xs text-astro-muted mt-0.5">
                      {m.image_count} images {" \u00b7 "} {new Date(m.merged_at).toLocaleDateString()}
                    </div>
                  </div>
                  <button
                    onClick={() => handleUnmerge(m)}
                    class="px-2 py-1 text-xs bg-yellow-700 text-white rounded hover:bg-yellow-600"
                  >
                    Unmerge
                  </button>
                </div>
              )}
            </For>
          </div>
        </Show>
      </Show>
    </div>
  );
};
