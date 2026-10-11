import "server-only";
import { gql, type StorefrontApi } from "@shopify/hydrogen";
import { commerceEnv } from "../../config.server";
import type { MenuItem } from "../../types";
import { storefrontRequest } from "../client.server";
import { toMenu } from "../transforms/menu";

// A Navigation menu from Shopify admin, three levels deep (Shopify's
// limit), with each item's type and linked resource so links can point at
// this site's routes.
export const MenuQuery = gql(`
  fragment MenuLink on MenuItem {
    title
    type
    url
    resource {
      __typename
      ... on Collection {
        handle
      }
      ... on Product {
        handle
      }
      ... on Page {
        handle
      }
      ... on ShopPolicy {
        handle
      }
    }
  }
  query Menu($handle: String!) {
    shop {
      primaryDomain {
        host
      }
    }
    menu(handle: $handle) {
      items {
        ...MenuLink
        items {
          ...MenuLink
          items {
            ...MenuLink
          }
        }
      }
    }
  }
`);

export type MenuData = NonNullable<
  StorefrontApi.ResultOf<typeof MenuQuery>["menu"]
>["items"];

// null when the store has no menu with that handle, or it's empty.
export async function fetchMenu(handle: string): Promise<MenuItem[] | null> {
  const data = await storefrontRequest(MenuQuery, { variables: { handle } });
  if (!data.menu) return null;
  const menu = toMenu(data.menu.items, [
    commerceEnv().storeDomain,
    data.shop.primaryDomain.host,
  ]);
  return menu.length > 0 ? menu : null;
}
