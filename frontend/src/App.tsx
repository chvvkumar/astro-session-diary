import { createSignal, type Component } from "solid-js";
import Gallery from "./components/Gallery";
import SearchBar from "./components/SearchBar";
import FilterPanel from "./components/FilterPanel";
import ImageDetail from "./components/ImageDetail";
import ScanDashboard from "./components/ScanDashboard";

const App: Component = () => {
  const [sidebarOpen, setSidebarOpen] = createSignal(false);

  return (
    <div class="min-h-screen bg-astro-dark">
      {/* Top Bar */}
      <header class="border-b border-gray-800 px-6 py-3 flex items-center gap-4">
        <button
          class="lg:hidden text-astro-muted hover:text-white p-1"
          onClick={() => setSidebarOpen((prev) => !prev)}
          aria-label="Toggle sidebar"
        >
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <h1 class="text-white font-bold text-lg whitespace-nowrap">
          Astro Cataloger
        </h1>
        <SearchBar />
      </header>

      {/* Main Layout */}
      <div class="flex">
        {/* Sidebar */}
        <aside class={`w-72 min-h-[calc(100vh-57px)] border-r border-gray-800 p-4 space-y-4 ${sidebarOpen() ? 'block' : 'hidden'} lg:block`}>
          <ScanDashboard />
          <FilterPanel />
        </aside>

        {/* Content */}
        <main class="flex-1 p-4">
          <Gallery />
        </main>
      </div>

      {/* Detail Modal (renders when an image is selected) */}
      <ImageDetail />
    </div>
  );
};

export default App;
