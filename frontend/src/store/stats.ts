import { createResource } from "solid-js";
import { api } from "../api/client";

const [stats, { refetch: refetchStats }] = createResource(() => api.getStats());

export function useStats() {
  return { stats, refetchStats };
}
