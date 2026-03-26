import { Component } from "solid-js";
import { useCatalog } from "../store/catalog";
import SearchBar from "./SearchBar";
import DateRangePicker from "./DateRangePicker";
import FilterToggles from "./FilterToggles";
import HardwareSelects from "./HardwareSelects";
import FitsQueryBuilder from "./FitsQueryBuilder";

const Sidebar: Component = () => {
  const { resetFilters } = useCatalog();

  return (
    <aside class="w-72 min-h-[calc(100vh-57px)] border-r border-[#2d2d2d] p-4 space-y-6 overflow-y-auto">
      <SearchBar />
      <DateRangePicker />
      <FilterToggles />
      <HardwareSelects />
      <FitsQueryBuilder />
      <button
        onClick={resetFilters}
        class="w-full py-2 text-xs text-astro-muted hover:text-white border border-gray-700 hover:border-gray-500 rounded transition-colors"
      >
        Reset Filters
      </button>
    </aside>
  );
};

export default Sidebar;
