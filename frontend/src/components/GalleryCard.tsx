import type { Component } from "solid-js";
import type { Image } from "../types";
import { api } from "../api/client";

interface Props {
  image: Image;
  onClick: (id: string) => void;
}

const GalleryCard: Component<Props> = (props) => {
  const thumbUrl = () =>
    props.image.thumbnail_path ? api.thumbnailUrl(props.image.thumbnail_path) : null;

  return (
    <div
      class="bg-astro-panel rounded-lg overflow-hidden cursor-pointer hover:ring-2 hover:ring-astro-accent transition-all"
      onClick={() => props.onClick(props.image.id)}
    >
      <div class="aspect-square bg-astro-dark flex items-center justify-center">
        {thumbUrl() ? (
          <img
            src={thumbUrl()!}
            alt={props.image.file_name}
            class="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <span class="text-astro-muted text-sm">No thumbnail</span>
        )}
      </div>
      <div class="p-2 text-xs">
        <p class="text-white truncate font-medium">{props.image.file_name}</p>
        <div class="flex justify-between text-astro-muted mt-1">
          <span>{props.image.filter_used || "—"}</span>
          <span>{props.image.exposure_time ? `${props.image.exposure_time}s` : "—"}</span>
        </div>
        {props.image.image_type && props.image.image_type !== "LIGHT" && (
          <span class="text-xs text-yellow-400/70">{props.image.image_type}</span>
        )}
        {props.image.capture_date && (
          <p class="text-astro-muted mt-0.5">
            {new Date(props.image.capture_date).toLocaleDateString()}
          </p>
        )}
      </div>
    </div>
  );
};

export default GalleryCard;
