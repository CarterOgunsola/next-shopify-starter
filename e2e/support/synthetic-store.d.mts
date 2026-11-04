export const STORE_DOMAIN: string;
export const SYNTHETIC_GIFT_CARD: string;
export function isStorefrontRequest(url: string): boolean;
export function serveDataset(
  name: string,
  options?: { imagesUrl?: string },
): void;
export function createStore(): {
  respond(body: {
    query?: string;
    variables?: Record<string, unknown>;
  }): unknown;
  catalog: string[];
};
