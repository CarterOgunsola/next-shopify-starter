import { gql } from "@shopify/hydrogen";

export const ImageFragment = gql(`
  fragment Image on Image {
    url
    altText
    width
    height
  }
`);

export const MediaFragment = gql(
  `
    fragment Media on Media {
      __typename
      alt
      previewImage {
        ...Image
      }
      ... on MediaImage {
        image {
          ...Image
        }
      }
      ... on Video {
        sources {
          url
          mimeType
        }
      }
      ... on ExternalVideo {
        embedUrl
      }
    }
  `,
  [ImageFragment],
);
