import { Component, Show } from "solid-js";
import { A } from "@solidjs/router";
import { useCatalog } from "../store/catalog";

function formatHours(seconds: number): string {
  return (seconds / 3600).toFixed(1) + "h";
}

const NavBar: Component = () => {
  const { targetData } = useCatalog();

  return (
    <header class="border-b border-[#2d2d2d] px-6 py-3 flex items-center gap-6">
      <h1 class="text-white font-bold text-lg whitespace-nowrap">AstroLog</h1>
      <nav class="flex gap-4">
        <A
          href="/"
          class="text-sm text-astro-muted hover:text-white transition-colors"
          activeClass="text-white font-medium"
          end
        >
          Dashboard
        </A>
        <A
          href="/admin"
          class="text-sm text-astro-muted hover:text-white transition-colors"
          activeClass="text-white font-medium"
        >
          Admin & Stats
        </A>
        <A
          href="/settings"
          class="text-astro-muted hover:text-white transition-colors text-sm"
          activeClass="text-white font-medium"
        >
          Settings
        </A>
      </nav>
      <Show when={targetData()}>
        {(data) => (
          <div class="ml-auto flex gap-5 text-sm items-end">
            <span class="text-astro-muted">
              Integration <span class="text-white font-semibold">{formatHours(data().aggregates.total_integration_seconds)}</span>
            </span>
            <span class="text-astro-muted">
              Targets <span class="text-white font-semibold">{String(data().aggregates.target_count)}</span>
            </span>
            <span class="text-astro-muted">
              Frames <span class="text-white font-semibold">{data().aggregates.total_frames.toLocaleString()}</span>
            </span>
            <span class="text-[10px] text-astro-muted/60 italic">filtered</span>
          </div>
        )}
      </Show>
    </header>
  );
};

export default NavBar;
