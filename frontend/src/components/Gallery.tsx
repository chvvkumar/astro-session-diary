import { Component, For, Show } from "solid-js";
import { useCatalog } from "../store/catalog";
import GalleryCard from "./GalleryCard";

const Gallery: Component = () => {
  const { imageList, setSelectedImageId, nextPage, prevPage, filters } = useCatalog();

  return (
    <div>
      <Show when={imageList.loading}>
        <div class="text-center py-12 text-astro-muted">Loading...</div>
      </Show>

      <Show when={imageList.error}>
        <div class="text-center py-12 text-red-400">
          Error loading images: {imageList.error?.message}
        </div>
      </Show>

      <Show when={imageList() && !imageList.loading}>
        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          <For each={imageList()!.items}>
            {(image) => (
              <GalleryCard image={image} onClick={setSelectedImageId} />
            )}
          </For>
        </div>

        {/* Pagination */}
        <div class="flex justify-between items-center mt-6 text-sm text-astro-muted">
          <button
            class="px-3 py-1 bg-astro-panel rounded disabled:opacity-30"
            disabled={filters().page <= 1}
            onClick={prevPage}
          >
            Previous
          </button>
          <span>
            Page {filters().page} of{" "}
            {Math.ceil((imageList()?.total || 0) / filters().page_size)}
            {" "}({imageList()?.total || 0} images)
          </span>
          <button
            class="px-3 py-1 bg-astro-panel rounded disabled:opacity-30"
            disabled={
              filters().page * filters().page_size >= (imageList()?.total || 0)
            }
            onClick={nextPage}
          >
            Next
          </button>
        </div>
      </Show>
    </div>
  );
};

export default Gallery;
