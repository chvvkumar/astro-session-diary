import { Component } from "solid-js";
import { A } from "@solidjs/router";

const NavBar: Component = () => {
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
    </header>
  );
};

export default NavBar;
