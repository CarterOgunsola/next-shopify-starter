// Domain types. Shaped for our pages, not for Shopify's schema; the
// transforms in shopify/ map one to the other. Nothing here is a Shopify
// type, so swapping the SDK never touches pages.

// Who is shopping. Only "consumer" exists today. Employee and wholesale
// buyers get their own catalogs and pricing later, so every commerce call
// takes a BuyerContext from the start.
export type Audience = "consumer" | "employee" | "wholesale";

export type BuyerContext =
  | { audience: "consumer" }
  | {
      audience: "employee" | "wholesale";
      customerAccessToken: string;
      companyLocationId: string;
    };

declare const publicBrand: unique symbol;

// A consumer context that may be used for shared ("use cache") reads. Only
// audience.ts mints it, so passing a signed-in buyer to a cached function is
// a compile error.
export type PublicContext = {
  readonly audience: "consumer";
  readonly [publicBrand]: true;
};

// Shopify decimal string, e.g. "29.00". Display only; Shopify does the math.
export type Money = {
  amount: string;
  currencyCode: string;
};

export type Image = {
  url: string;
  altText: string | null;
  width: number | null;
  height: number | null;
};

export type Media =
  | { kind: "image"; image: Image }
  | {
      kind: "video";
      alt: string | null;
      sources: { url: string; mimeType: string }[];
      preview: Image | null;
    }
  | {
      kind: "externalVideo";
      alt: string | null;
      embedUrl: string;
      preview: Image | null;
    };

export type ProductOption = {
  name: string;
  values: { name: string; swatch?: string }[];
};

export type SellingPlanGroup = {
  name: string;
  plans: {
    id: string;
    name: string;
    description: string | null;
    // Delivered on a schedule (a subscription), not once.
    recurring: boolean;
    // An introductory price for this many orders, then the later price
    // (SellingPlanPrice.later); null when the price doesn't change.
    introOrders: number | null;
  }[];
};

// A selling plan's prices for one variant, as Shopify allocates them.
export type SellingPlanPrice = {
  planId: string;
  // Per delivery, for the first orders (or always).
  price: Money;
  // Off the one-time price, in whole percent (rounded down), once any
  // introductory orders are over, when there's a saving.
  savingsPercent?: number;
  // Off the one-time price on the introductory orders, when that differs.
  introSavingsPercent?: number;
  // Per delivery after the introductory orders, when the price changes.
  later?: Money;
  // Charged at checkout, when that differs from price: a prepaid plan's
  // total for all its deliveries, or a deferred charge.
  checkoutCharge?: Money;
};

// A product's review rating from the review app, on a 5-point scale.
export type ReviewSummary = { rating: number; count: number };

// A supplement's label content, from its supplement.* metafields.
export type SupplementInfo = {
  servingSize: string | null;
  servingsPerContainer: number | null;
  facts: {
    ingredient: string;
    amount: string;
    unit: string;
    // Percent of Daily Value; null where none is established.
    dailyValue: number | null;
    source: string | null;
    // The proprietary blend the row belongs to, and the blend's total
    // amount (21 CFR 101.36(c)(2)).
    blend: string | null;
    blendTotal: string | null;
  }[];
  otherIngredients: string[];
  // Of the nine major food allergens, as the label states them: the kind
  // for tree nuts, fish and shellfish ("Almonds"), otherwise the name.
  allergens: string[];
  directions: string | null;
  warnings: string | null;
  // How many structure/function claims the product's page makes: with any,
  // the DSHEA disclaimer shows (singular for one, plural for more).
  structureFunctionClaims: number | null;
  labelImage: Image | null;
};

export type ProductContent = {
  id: string;
  // Badges that don't depend on price or stock (see badges.ts).
  badges?: Badge[];
  handle: string;
  title: string;
  vendor: string;
  productType: string;
  // Sanitized: safe to render as HTML.
  descriptionHtml: string;
  options: ProductOption[];
  media: Media[];
  seo: { title: string; description: string };
  // Plan names and intervals only; plan prices are in VariantState.
  sellingPlanGroups: SellingPlanGroup[];
  // Only sold on a subscription plan; there's no one-time purchase.
  requiresSellingPlan: boolean;
  // Which image goes with which option values, so the gallery can follow
  // the selection without a request.
  variantImages: { options: Record<string, string>; url: string }[];
  // Supplement facts and label content; null for products that aren't
  // supplements.
  supplement: SupplementInfo | null;
  // Carries a California Prop 65 warning (supplement.prop65_warning), shown
  // before the purchase controls; supplement or not.
  prop65: { chemical: string | null } | null;
  // null until the product has a review.
  reviews: ReviewSummary | null;
  // A gift card: sold with optional recipient details, never on a plan.
  isGiftCard: boolean;
};

// Buyer-specific variant state. Never shared-cached.
export type VariantState = {
  id: string;
  title: string;
  sku: string | null;
  selectedOptions: { name: string; value: string }[];
  // Absent in a cached view sent for first paint (firstPaintView): stock
  // is only claimed from the live answer.
  available?: boolean;
  // Units left when few are (see badges.ts lowStock).
  lowStock?: number;
  price: Money;
  compareAtPrice?: Money;
  sellingPlanPrices: SellingPlanPrice[];
  // B2B later.
  quantityRule?: { min: number; max?: number; increment: number };
  priceBreaks?: { minQuantity: number; price: Money }[];
};

// One option value as the buyer sees it, given the rest of the current
// selection: whether that combination exists and is in stock.
export type OptionValueState = {
  name: string;
  selected: boolean;
  exists: boolean;
  available: boolean;
};

export type OptionState = {
  name: string;
  values: OptionValueState[];
};

// Live product state for one buyer and selection. variant is null only when
// the product has no variant Shopify can pick.
export type VariantView = {
  productId: string;
  variant: VariantState | null;
  options: OptionState[];
};

// Listing tile. Price and availability are the consumer's; buyer-specific
// prices (B2B) will come from getPriceList.
export type ProductCard = {
  id: string;
  handle: string;
  title: string;
  featuredImage: Image | null;
  price: PriceRange;
  available: boolean;
  // Shopify's search analytics params, for links from search results.
  trackingParameters: string | null;
  // The review rating, when the product has reviews.
  reviews?: ReviewSummary | null;
  isGiftCard?: boolean;
  // Its only variant, when it can be added without choosing anything (or
  // seeing a warning).
  quickAddVariantId?: string | null;
  // Carries a California Prop 65 warning (see SupplementInfo).
  prop65?: { chemical: string | null } | null;
  badges?: Badge[];
};

// A label on a product: built from its data (badges.ts), or the merchant's.
export type Badge = {
  kind: "sale" | "soldOut" | "new" | "subscription" | "merchant";
  label: string;
};

export type PriceRange = {
  min: Money;
  max: Money;
  compareAtMin?: Money;
};

export type Collection = {
  id: string;
  handle: string;
  title: string;
  descriptionHtml: string;
  image: Image | null;
  seo: { title: string; description: string };
};

export type Page<T> = {
  items: T[];
  // Opaque cursors for the next and previous pages, null at either end.
  nextCursor: string | null;
  previousCursor: string | null;
};

// A filter group from Shopify Search & Discovery. Each value's input is
// Shopify's own filter (JSON), which is what goes into the URL.
export type Facet = {
  id: string;
  label: string;
  type: "list" | "boolean" | "price";
  values: { id: string; label: string; count: number; input: string }[];
};

// One page of a collection, all products or search results.
export type Listing = {
  products: Page<ProductCard>;
  facets: Facet[];
  // Search only.
  totalCount?: number;
};

export type PredictiveResults = {
  products: ProductCard[];
  collections: {
    handle: string;
    title: string;
    trackingParameters: string | null;
  }[];
  queries: { text: string; trackingParameters: string | null }[];
};

// A Shopify Navigation menu item, pointed at this site. url is a path here,
// or an absolute URL for another site (external: true). An item with
// children may have no link of its own (url null).
export type MenuItem = {
  title: string;
  url: string | null;
  external?: boolean;
  items: MenuItem[];
};

// A store policy from Shopify admin, sanitized.
export type ShopPolicy = { handle: string; title: string; bodyHtml: string };

// One variant as an offer in the product page's structured data.
export type VariantOffer = {
  id: string;
  title: string;
  sku: string | null;
  // The barcode, when it's a GTIN.
  gtin: string | null;
  available: boolean;
  price: Money;
  // Its selling plans' first-period prices.
  planPrices: Money[];
  imageUrl: string | null;
  selectedOptions: { name: string; value: string }[];
};

export type SitemapEntry = {
  path: string;
  lastModified: string;
};

export type CartLine = {
  id: string;
  quantity: number;
  // Line attributes (engraving, app data), as Shopify has them.
  attributes: { key: string; value: string }[];
  // The line this one belongs to (an add-on or bundle component), if any.
  parentLineId: string | null;
  merchandise: {
    id: string;
    title: string;
    sku: string | null;
    // Shopify's quantity rule (B2B), when the variant has one.
    quantityRule?: VariantState["quantityRule"];
    product: {
      id: string;
      handle: string;
      title: string;
      vendor: string;
      productType: string;
    };
    image: Image | null;
    selectedOptions: { name: string; value: string }[];
  };
  sellingPlan: { id: string; name: string } | null;
  // Plans this line can switch to, with their ongoing price per item per
  // delivery; empty when the product has none. recurring: a subscription;
  // saves: cheaper than the one-time price; prepaid: paid up front for
  // several deliveries.
  planOptions: {
    id: string;
    name: string;
    price: Money;
    recurring: boolean;
    saves: boolean;
    prepaid: boolean;
  }[];
  // No one-time purchase: the line must stay on a plan.
  requiresSellingPlan: boolean;
  // A gift card (no gift card can be used on an order with one).
  isGiftCard: boolean;
  // Discounts on this line alone, as Shopify reports them (a code or a
  // discount title, and the amount). Already taken off the line total.
  discounts: { label: string; amount: Money }[];
  cost: {
    amountPerQuantity: Money;
    compareAtAmountPerQuantity: Money | null;
    totalAmount: Money;
  };
};

// Cart problems Shopify reports without failing the request (out of stock,
// quantity reduced, discount not applicable). Message is ours, not Shopify's.
export type CartWarning = {
  code: string;
  message: string;
};

// The cart as the browser gets it. No cart id or checkout URL: the id
// carries the cart's access key, and checkout goes through /cart/checkout.
export type Cart = {
  // The cart's id without its access key, for analytics.
  analyticsId: string;
  updatedAt: string;
  totalQuantity: number;
  lines: CartLine[];
  // Subtotal: the line totals. Total: after order discounts. Due today:
  // what checkout charges now (less when a selling plan bills later).
  cost: {
    subtotalAmount: Money;
    totalAmount: Money;
    checkoutChargeAmount: Money;
  };
  // Cart note and attributes (gift messages, app data), as Shopify has them.
  note: string | null;
  attributes: { key: string; value: string }[];
  // Order-level discounts, between subtotal and total.
  discounts: { label: string; amount: Money }[];
  discountCodes: { code: string; applicable: boolean }[];
  // Gift cards applied to the cart: the last characters of the code, what
  // this order uses and what's left on the card.
  giftCards: {
    id: string;
    lastCharacters: string;
    amountUsed: Money;
    balance: Money;
  }[];
  warnings: CartWarning[];
};

// Server only: Shopify's cart with its full id (including the access key)
// and checkout URL.
export type CartRecord = Omit<Cart, "analyticsId"> & {
  id: string;
  checkoutUrl: string;
};

// Outcome of a cart change. On failure, cart is the cart as it stands (or
// null when there is none), and error is a message for the visitor.
export type CartResult =
  // applied: what a code turned out to be, when it was a gift card.
  | { ok: true; cart: Cart; applied?: "giftCard" }
  | { ok: false; error: string; cart: Cart | null };

export type CartLineInput = {
  merchandiseId: string;
  quantity: number;
  sellingPlanId?: string;
  // Line attributes (gift card recipient details).
  attributes?: { key: string; value: string }[];
};

// A change to a line: its quantity, its plan, or both. A plan switch
// sends no quantity, so it never undoes a quantity change in flight.
export type CartLineUpdate = {
  id: string;
  quantity?: number;
  sellingPlanId?: string | null;
};

// What Shopify's browser analytics needs to know about the shop.
export type ShopAnalyticsConfig = {
  shopId: string;
  storefrontId: string;
  myshopifyDomain: string;
  // The store's market for this site, from the Storefront API.
  i18n: { country: string; language: string; currency: string };
};

export type CustomerProfile = {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
};

export type OrderSummary = {
  id: string;
  // The numeric id, for /account/orders/<id>.
  legacyId: string;
  name: string;
  processedAt: string;
  financialStatus: string | null;
  fulfillmentStatus: string;
  total: Money;
  // Items ordered (quantities summed).
  itemCount: number;
  // Shopify's order status page (items, tracking, invoices), when given.
  statusPageUrl: string | null;
};

// One of the customer's orders, as the order page shows it.
export type OrderDetail = OrderSummary & {
  lines: {
    id: string;
    title: string;
    variantTitle: string | null;
    quantity: number;
    price: Money;
    // After line discounts.
    total: Money;
    image: { url: string; altText: string | null } | null;
  }[];
  discounts: { title: string; amount: Money }[];
  subtotal: Money | null;
  shipping: { title: string | null; amount: Money } | null;
  tax: Money | null;
  // One per shipment.
  fulfillments: {
    status: string | null;
    // The carrier's latest status (IN_TRANSIT, DELIVERED, …).
    shipmentStatus: string | null;
    estimatedDeliveryAt: string | null;
    itemCount: number;
    tracking: {
      company: string | null;
      number: string | null;
      url: string | null;
    }[];
  }[];
  // Formatted lines, as Shopify formats them for the country.
  shippingAddress: string[] | null;
  billingAddress: string[] | null;
};

// A saved address. countryCode and zoneCode are ISO codes (US, CA).
export type CustomerAddress = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  address1: string | null;
  address2: string | null;
  city: string | null;
  zoneCode: string | null;
  countryCode: string | null;
  zip: string | null;
  phoneNumber: string | null;
  formatted: string[];
  isDefault: boolean;
};

// What an address form sends.
export type AddressInput = {
  firstName: string;
  lastName: string;
  company: string;
  address1: string;
  address2: string;
  city: string;
  zoneCode: string;
  countryCode: string;
  zip: string;
  phoneNumber: string;
};

// The outcome of an account change, for the form that made it. error is in
// our wording; fieldErrors maps form field names to messages.
export type AccountActionResult =
  | { ok: true; message: string }
  | {
      ok: false;
      error: string;
      fieldErrors?: Record<string, string>;
      // What the customer submitted, so the form can show it again: React
      // resets a form's fields after its action runs.
      values?: Record<string, string>;
      // The session ended: sign in again, coming back here.
      signIn?: string;
    };

// What the account page can show.
export type AccountState =
  | { status: "unavailable" }
  | { status: "signed-out" }
  // Signed in, but the access token expired: send through /account/refresh.
  | { status: "needs-refresh" }
  | { status: "error" }
  | {
      status: "signed-in";
      customer: CustomerProfile;
      orders: OrderSummary[];
      // Shopify's hosted account: profile, addresses, all orders, and
      // apps' account pages (subscriptions).
      manageUrl: string;
    };

// What quick add needs to show a product's purchase panel in a dialog:
// public, cached product data (GET /api/commerce/quick-add).
export type QuickAddProduct = {
  handle: string;
  title: string;
  image: Image | null;
  options: ProductOption[];
  sellingPlanGroups: SellingPlanGroup[];
  requiresSellingPlan: boolean;
  isGiftCard: boolean;
  // Shown in the dialog before adding.
  prop65: { chemical: string | null } | null;
  // The cached default variant, until the live view answers.
  initialView: VariantView | null;
  backInStock: boolean;
  marketingOptIn: boolean;
};
