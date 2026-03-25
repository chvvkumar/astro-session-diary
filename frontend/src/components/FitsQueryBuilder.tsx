import { Component, For, createSignal } from "solid-js";
import { useCatalog } from "../store/catalog";

const OPERATORS = [
  { value: "eq", label: "=" },
  { value: "neq", label: "!=" },
  { value: "gt", label: ">" },
  { value: "lt", label: "<" },
  { value: "gte", label: ">=" },
  { value: "lte", label: "<=" },
  { value: "contains", label: "contains" },
];

const FitsQueryBuilder: Component = () => {
  const { filters, setFilters } = useCatalog();
  const [newKey, setNewKey] = createSignal("");
  const [newOp, setNewOp] = createSignal("eq");
  const [newVal, setNewVal] = createSignal("");

  const addRow = () => {
    const key = newKey().trim();
    const val = newVal().trim();
    if (!key || !val) return;
    setFilters((prev) => ({
      ...prev,
      fitsQueries: [...prev.fitsQueries, { key, operator: newOp(), value: val }],
    }));
    setNewKey("");
    setNewVal("");
  };

  const removeRow = (index: number) => {
    setFilters((prev) => ({
      ...prev,
      fitsQueries: prev.fitsQueries.filter((_, i) => i !== index),
    }));
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addRow();
    }
  };

  return (
    <div class="space-y-2">
      <label class="text-xs text-astro-muted">FITS Header Query</label>

      {/* Existing rows */}
      <For each={filters().fitsQueries}>
        {(row, i) => (
          <div class="flex items-center gap-1 text-xs">
            <span class="text-white font-mono flex-1 truncate">{row.key} {row.operator} {row.value}</span>
            <button onClick={() => removeRow(i())} class="text-red-400 hover:text-red-300 px-1">&times;</button>
          </div>
        )}
      </For>

      {/* New row inputs */}
      <div class="flex gap-1">
        <input
          type="text"
          value={newKey()}
          onInput={(e) => setNewKey(e.currentTarget.value)}
          onKeyDown={onKeyDown}
          placeholder="Key"
          class="w-20 px-1.5 py-1 bg-astro-dark border border-gray-700 rounded text-xs text-white font-mono focus:outline-none focus:ring-1 focus:ring-astro-accent"
        />
        <select
          value={newOp()}
          onChange={(e) => setNewOp(e.currentTarget.value)}
          class="px-1 py-1 bg-astro-dark border border-gray-700 rounded text-xs text-white focus:outline-none"
        >
          <For each={OPERATORS}>{(op) => <option value={op.value}>{op.label}</option>}</For>
        </select>
        <input
          type="text"
          value={newVal()}
          onInput={(e) => setNewVal(e.currentTarget.value)}
          onKeyDown={onKeyDown}
          placeholder="Value"
          class="flex-1 px-1.5 py-1 bg-astro-dark border border-gray-700 rounded text-xs text-white focus:outline-none focus:ring-1 focus:ring-astro-accent"
        />
        <button onClick={addRow} class="px-2 py-1 bg-astro-accent text-white rounded text-xs hover:bg-astro-accent/80">+</button>
      </div>
    </div>
  );
};

export default FitsQueryBuilder;
