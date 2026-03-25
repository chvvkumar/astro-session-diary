import { Component } from "solid-js";
import SearchBar from "./SearchBar";
import DateRangePicker from "./DateRangePicker";
import FilterToggles from "./FilterToggles";
import HardwareSelects from "./HardwareSelects";
import FitsQueryBuilder from "./FitsQueryBuilder";

const Sidebar: Component = () => {
  return (
    <aside class="w-72 min-h-[calc(100vh-57px)] border-r border-gray-800 p-4 space-y-4 overflow-y-auto">
      <SearchBar />
      <DateRangePicker />
      <FilterToggles />
      <HardwareSelects />
      <FitsQueryBuilder />
    </aside>
  );
};

export default Sidebar;
