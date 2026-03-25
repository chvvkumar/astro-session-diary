import { createSignal, createResource } from "solid-js";
import { api } from "../api/client";
import type { ImageFilters, ImageListResponse, ImageDetail } from "../types";

const defaultFilters: ImageFilters = {
  page: 1,
  page_size: 50,
};

const [filters, setFilters] = createSignal<ImageFilters>({ ...defaultFilters });
const [imageList] = createResource(filters, (f) => api.listImages(f));

const [selectedImageId, setSelectedImageId] = createSignal<string | null>(null);
const [selectedImage] = createResource(selectedImageId, (id) =>
  id ? api.getImage(id) : undefined
);

export function useCatalog() {
  return {
    filters,
    setFilters,
    imageList,
    selectedImageId,
    setSelectedImageId,
    selectedImage,

    updateFilter: <K extends keyof ImageFilters>(key: K, value: ImageFilters[K]) => {
      setFilters((prev) => ({ ...prev, [key]: value, page: key === "page" ? value as number : 1 }));
    },

    nextPage: () => {
      const current = filters();
      const list = imageList();
      if (list && current.page * current.page_size < list.total) {
        setFilters((prev) => ({ ...prev, page: prev.page + 1 }));
      }
    },

    prevPage: () => {
      setFilters((prev) => ({ ...prev, page: Math.max(1, prev.page - 1) }));
    },

    resetFilters: () => setFilters({ ...defaultFilters }),
  };
}
