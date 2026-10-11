import { gql } from "@shopify/hydrogen";

export const FilterFragment = gql(`
  fragment Filter on Filter {
    id
    label
    type
    values {
      id
      label
      count
      input
    }
  }
`);

export const PageInfoFragment = gql(`
  fragment PageInfo on PageInfo {
    hasNextPage
    hasPreviousPage
    startCursor
    endCursor
  }
`);

export const CollectionFragment = gql(`
  fragment Collection on Collection {
    id
    handle
    title
    description
    descriptionHtml
    image {
      url
      altText
      width
      height
    }
    seo {
      title
      description
    }
  }
`);
