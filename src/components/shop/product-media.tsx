import type { Media } from "@/lib/commerce";
import { ShopifyImage } from "./shopify-image";

const FALLBACK_SIZE = 1024;

// The first item is the lead image (ProductGallery puts the selected
// variant's image there).
export function ProductMedia({ media }: { media: Media[] }) {
  if (media.length === 0) return null;

  return (
    <ul aria-label="Product media">
      {media.map((item, index) => (
        <li key={index}>
          <MediaItem item={item} lead={index === 0} />
        </li>
      ))}
    </ul>
  );
}

// The lead image is the page's largest paint: fetched first and never lazy
// (Next 16 replaces priority with these; preload isn't combined with them).
function MediaItem({ item, lead }: { item: Media; lead: boolean }) {
  switch (item.kind) {
    case "image":
      return (
        <ShopifyImage
          src={item.image.url}
          alt={item.image.altText ?? ""}
          width={item.image.width ?? FALLBACK_SIZE}
          height={item.image.height ?? FALLBACK_SIZE}
          sizes="(min-width: 768px) 50vw, 100vw"
          {...(lead
            ? { loading: "eager" as const, fetchPriority: "high" as const }
            : {})}
        />
      );
    case "video":
      return (
        <video
          controls
          preload="none"
          poster={item.preview?.url}
          aria-label={item.alt ?? undefined}
        >
          {item.sources.map((source) => (
            <source key={source.url} src={source.url} type={source.mimeType} />
          ))}
        </video>
      );
    case "externalVideo":
      // A link, not an embed: hosted players set cookies before consent.
      return (
        <a href={item.embedUrl} target="_blank" rel="noopener noreferrer">
          {item.alt ?? "Watch the video"} (opens in a new tab)
        </a>
      );
  }
}
