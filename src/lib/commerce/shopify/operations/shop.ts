import "server-only";
import { gql } from "@shopify/hydrogen";
import type { ShopPolicy } from "../../types";
import { storefrontRequest } from "../client.server";
import { sanitizeRichText } from "../transforms/html";

export const ShopIdQuery = gql(`
  query ShopId {
    shop {
      id
    }
  }
`);

// The store's market for this site's locale: country, language and the
// currency prices are in.
export const ShopLocalizationQuery = gql(`
  query ShopLocalization($country: CountryCode, $language: LanguageCode)
  @inContext(country: $country, language: $language) {
    localization {
      country {
        isoCode
        currency {
          isoCode
        }
      }
      language {
        isoCode
      }
    }
  }
`);

export async function fetchShopLocalization(): Promise<{
  country: string;
  language: string;
  currency: string;
}> {
  const { localization } = await storefrontRequest(ShopLocalizationQuery);
  return {
    country: localization.country.isoCode,
    language: localization.language.isoCode,
    currency: localization.country.currency.isoCode,
  };
}

export async function fetchShopId(): Promise<string> {
  const { shop } = await storefrontRequest(ShopIdQuery);
  return shop.id;
}

// The store's policies as set in Shopify admin (Settings > Policies), at
// Shopify's /policies/<handle> paths. Unset policies are null.
export const ShopPoliciesQuery = gql(`
  fragment Policy on ShopPolicy {
    handle
    title
    body
  }
  query ShopPolicies {
    shop {
      privacyPolicy {
        ...Policy
      }
      refundPolicy {
        ...Policy
      }
      shippingPolicy {
        ...Policy
      }
      termsOfService {
        ...Policy
      }
      termsOfSale {
        ...Policy
      }
      subscriptionPolicy {
        handle
        title
        body
      }
    }
  }
`);

export async function fetchShopPolicies(): Promise<ShopPolicy[]> {
  const { shop } = await storefrontRequest(ShopPoliciesQuery);
  return [
    shop.refundPolicy,
    shop.shippingPolicy,
    shop.subscriptionPolicy,
    shop.termsOfSale,
    shop.termsOfService,
    shop.privacyPolicy,
  ].flatMap((policy) =>
    policy && policy.body.trim()
      ? [
          {
            handle: policy.handle,
            title: policy.title,
            bodyHtml: sanitizeRichText(policy.body),
          },
        ]
      : [],
  );
}
