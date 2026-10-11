import type { Image, Media } from "../../types";

type ImageData = {
  url: string;
  altText?: string | null;
  width?: number | null;
  height?: number | null;
};

type MediaData = {
  __typename: string;
  alt?: string | null;
  previewImage?: ImageData | null;
  image?: ImageData | null;
  sources?: readonly { url: string; mimeType: string }[];
  embedUrl?: string;
};

export function toImage(image: ImageData): Image {
  return {
    url: image.url,
    altText: image.altText ?? null,
    width: image.width ?? null,
    height: image.height ?? null,
  };
}

// 3D models and anything new are skipped until we render them.
export function toMedia(media: MediaData): Media | null {
  const preview = media.previewImage ? toImage(media.previewImage) : null;
  const alt = media.alt ?? null;
  switch (media.__typename) {
    case "MediaImage":
      return media.image
        ? {
            kind: "image",
            image: {
              ...toImage(media.image),
              altText: media.image.altText ?? alt,
            },
          }
        : null;
    case "Video":
      return {
        kind: "video",
        alt,
        sources: (media.sources ?? []).map(({ url, mimeType }) => ({
          url,
          mimeType,
        })),
        preview,
      };
    case "ExternalVideo":
      return media.embedUrl
        ? { kind: "externalVideo", alt, embedUrl: media.embedUrl, preview }
        : null;
    default:
      return null;
  }
}
