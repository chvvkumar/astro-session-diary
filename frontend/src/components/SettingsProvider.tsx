import { createContext, useContext, type ParentComponent } from "solid-js";
import { useSettings, getFilterColorMap, getFilterAliasMap } from "../store/settings";
import type { SettingsResponse, GeneralSettings, FilterConfig, EquipmentConfig } from "../types";
import type { Resource } from "solid-js";
import type { FilterBadgeStyle } from "../utils/filterStyles";

interface SettingsContextValue {
  settings: Resource<SettingsResponse | undefined>;
  filterColorMap: () => Record<string, string>;
  filterAliasMap: () => Record<string, string>;
  filterBadgeStyle: () => FilterBadgeStyle;
  saveGeneral: (g: GeneralSettings) => Promise<SettingsResponse>;
  saveFilters: (f: Record<string, FilterConfig>) => Promise<SettingsResponse>;
  saveEquipment: (e: EquipmentConfig) => Promise<SettingsResponse>;
  refetchSettings: () => void;
}

const SettingsContext = createContext<SettingsContextValue>();

export const SettingsProvider: ParentComponent = (props) => {
  const store = useSettings();

  const value: SettingsContextValue = {
    settings: store.settings,
    filterColorMap: () => getFilterColorMap(store.settings()),
    filterAliasMap: () => getFilterAliasMap(store.settings()),
    filterBadgeStyle: () => (store.settings()?.general.filter_style as FilterBadgeStyle) || "solid",
    saveGeneral: store.saveGeneral,
    saveFilters: store.saveFilters,
    saveEquipment: store.saveEquipment,
    refetchSettings: store.refetchSettings,
  };

  return (
    <SettingsContext.Provider value={value}>
      {props.children}
    </SettingsContext.Provider>
  );
};

export function useSettingsContext() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettingsContext must be used within SettingsProvider");
  return ctx;
}
