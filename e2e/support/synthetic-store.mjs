// A synthetic Shopify store for the end-to-end tests, answering Storefront
// API requests from the recorded fixtures in
// src/lib/commerce/testing/fixtures (synthetic dev-store data only). Used
// for `next build` and `next start` (preload.mjs) and, per test, by the
// Playwright fixture (test.ts), which can override any operation.
//
// The catalog is the products with a recorded ProductContent fixture. Any
// option selection resolves against their variants. Carts live in memory:
// one per store instance (each test has its own).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const STORE_DOMAIN = "synthetic-store.myshopify.com";
// From the repository root, where the tests and the server run (this
// module is also loaded by Playwright as CommonJS, without import.meta).
const FIXTURES = join(process.cwd(), "src/lib/commerce/testing/fixtures");
const CURRENCY = "USD";
// The dev store's test discount codes (TEST*), as set up there: TEST10
// takes 10% off; TEST5OFF takes $5 off a subtotal of $50.00 or more.
const DISCOUNTS = {
  TEST10: { percent: 10, minimum: 0 },
  TEST5OFF: { amount: 5, minimum: 50 },
};
const discount = (code) => DISCOUNTS[code.toUpperCase()];

const fixtures = new Map(
  readdirSync(FIXTURES)
    .filter((file) => file.endsWith(".json"))
    .map((file) => [
      file.slice(0, -".json".length),
      JSON.parse(readFileSync(join(FIXTURES, file), "utf8")).data,
    ]),
);
const fixture = (name) => structuredClone(fixtures.get(name));
const named = (prefix) =>
  [...fixtures.keys()].filter((name) => name.startsWith(`${prefix}.`));

// Products: handle -> ProductContent product.
const contents = new Map(
  named("ProductContent").map((name) => {
    const product = fixtures.get(name).product;
    return [product.handle, product];
  }),
);

// Card-shaped product nodes recorded anywhere, by handle.
const cards = new Map();
function collectCards(value) {
  if (Array.isArray(value)) return value.forEach(collectCards);
  if (!value || typeof value !== "object") return;
  if (
    typeof value.handle === "string" &&
    value.priceRange &&
    value.variants?.pageInfo &&
    !cards.has(value.handle)
  ) {
    cards.set(value.handle, value);
  }
  Object.values(value).forEach(collectCards);
}
for (const data of fixtures.values()) collectCards(data);

const imageOf = (product) =>
  product.media.nodes.find((media) => media.image)?.image ?? null;

// A card built from content, for products no listing was recorded with.
function cardFromContent(product) {
  const prices = product.variants.nodes.map((v) => Number(v.price.amount));
  const variants = product.variants.nodes.slice(0, 10);
  return {
    id: product.id,
    handle: product.handle,
    title: product.title,
    availableForSale: product.variants.nodes.some((v) => v.availableForSale),
    trackingParameters: null,
    featuredImage: imageOf(product),
    priceRange: {
      minVariantPrice: money(Math.min(...prices)),
      maxVariantPrice: money(Math.max(...prices)),
    },
    reviewRating: product.reviewRating,
    reviewCount: product.reviewCount,
    requiresSellingPlan: product.requiresSellingPlan,
    isGiftCard: product.isGiftCard,
    publishedAt: product.publishedAt,
    merchantBadges: product.merchantBadges,
    variants: {
      pageInfo: { hasNextPage: product.variants.nodes.length > 10 },
      nodes: variants.map((v) => ({
        id: v.id,
        availableForSale: v.availableForSale,
        price: v.price,
        compareAtPrice: null,
        sellingPlanAllocations: v.sellingPlanAllocations,
      })),
    },
  };
}

const catalog = [...contents.keys()].sort((a, b) =>
  contents.get(a).title.localeCompare(contents.get(b).title, "en"),
);
const card = (handle) =>
  structuredClone(cards.get(handle) ?? cardFromContent(contents.get(handle)));
// Collections with a default-view listing recorded.
const listingHandles = named("CollectionListing")
  .filter((name) => name.split(".").length === 2)
  .map((name) => name.split(".")[1]);

const NO_PAGE = {
  hasNextPage: false,
  hasPreviousPage: false,
  startCursor: null,
  endCursor: null,
};
const money = (amount) => ({
  amount: String(Math.round(amount * 100) / 100),
  currencyCode: CURRENCY,
});
const hex = () =>
  Array.from({ length: 12 }, () =>
    Math.floor(Math.random() * 16).toString(16),
  ).join("");
const lower = (text) => String(text).toLowerCase();

// The variant a selection resolves to: the one matching most of the
// selected options, preferring available ones (Shopify falls back the same
// way), with the product's default variant's full state as the template.
function variantFor(product, selected) {
  const wanted = (selected ?? []).map((o) => [lower(o.name), lower(o.value)]);
  const score = (variant) =>
    wanted.filter(([name, value]) =>
      variant.selectedOptions.some(
        (o) => lower(o.name) === name && lower(o.value) === value,
      ),
    ).length *
      2 +
    (variant.availableForSale ? 1 : 0);
  const best = [...product.variants.nodes].sort(
    (a, b) => score(b) - score(a),
  )[0];
  const base = structuredClone(product.selectedOrFirstAvailableVariant);
  if (!best || best.id === base.id) return base;
  return {
    ...base,
    id: best.id,
    title: best.title,
    sku: best.sku,
    availableForSale: best.availableForSale,
    price: best.price,
    selectedOptions: best.selectedOptions,
    compareAtPrice:
      best.compareAtPrice &&
      Number(best.compareAtPrice.amount) > Number(best.price.amount)
        ? best.compareAtPrice
        : null,
    quantityAvailable: Number.isFinite(stockOf(product, best))
      ? stockOf(product, best)
      : 0,
    currentlyNotInStock: false,
  };
}

function variantView(handle, selectedOptions) {
  const product = contents.get(handle);
  if (!product) return { product: null };
  return {
    product: {
      id: product.id,
      options: product.options.map(({ name, optionValues }) => ({
        name,
        optionValues: optionValues.map(({ name }) => ({ name })),
      })),
      encodedVariantExistence: product.encodedVariantExistence,
      encodedVariantAvailability: product.encodedVariantAvailability,
      selectedOrFirstAvailableVariant: variantFor(product, selectedOptions),
    },
  };
}

function findVariant(id) {
  for (const product of contents.values()) {
    const variant = product.variants.nodes.find((v) => v.id === id);
    if (variant) return { product, variant };
  }
  return null;
}

// Units a variant can be added in: the recorded default variant's
// quantityAvailable for any available variant (none recorded, or 0 for an
// untracked one: no limit), none for a sold-out one.
function stockOf(product, variant) {
  if (!variant.availableForSale) return 0;
  const recorded = product.selectedOrFirstAvailableVariant.quantityAvailable;
  return recorded > 0 ? recorded : Infinity;
}

// The recorded gift card's state: a synthetic code that applies, with the
// recorded balance (the card's real code and ending were never kept).
const giftCardFixture = fixtures.get("CartGiftCardCodesAdd.applied")
  ?.cartGiftCardCodesAdd.cart.appliedGiftCards[0];
export const SYNTHETIC_GIFT_CARD = "SYNTHETICGIFT0000";

// A variant's plan allocations, by plan id: the recorded default variant's
// allocation for each plan, scaled to this variant's price (exact for the
// default variant). Plans without a recorded allocation aren't offered.
function plansFor(product, variant) {
  const base = product.selectedOrFirstAvailableVariant;
  const ratio = Number(variant.price.amount) / Number(base.price.amount);
  const scaled = (value) => money(Number(value.amount) * ratio);
  const recorded = new Map(
    base.sellingPlanAllocations.nodes.map((a) => [a.sellingPlan.id, a]),
  );
  return product.sellingPlanGroups.nodes.flatMap((group) =>
    group.sellingPlans.nodes.flatMap((plan) => {
      const allocation = recorded.get(plan.id);
      if (!allocation) return [];
      return [
        {
          sellingPlan: {
            id: plan.id,
            name: plan.name,
            recurringDeliveries: plan.recurringDeliveries,
          },
          priceAdjustments: allocation.priceAdjustments.map((a) => ({
            price: scaled(a.price),
            compareAtPrice: scaled(a.compareAtPrice),
            perDeliveryPrice: scaled(a.perDeliveryPrice),
          })),
        },
      ];
    }),
  );
}

export function createStore() {
  let cart = null;
  const warnings = [];
  const userErrors = [];
  const newCart = () => ({
    token: `syntheticCart${hex()}`,
    key: `syntheticKey${hex()}`,
    lines: [],
    discountCodes: [],
    giftCard: null,
  });

  function line({ merchandiseId, quantity, sellingPlanId, attributes }) {
    const found = findVariant(merchandiseId);
    if (!found) return null;
    const { product, variant } = found;
    const allocations = plansFor(product, variant);
    const plan = allocations.find((a) => a.sellingPlan.id === sellingPlanId);
    const unit = Number(
      (plan?.priceAdjustments[0].price ?? variant.price).amount,
    );
    const image = imageOf(product);
    return {
      id: `gid://shopify/CartLine/${hex()}?cart=${cart.token}`,
      quantity,
      attributes: attributes ?? [],
      parentRelationship: null,
      merchandise: {
        __typename: "ProductVariant",
        id: variant.id,
        title: variant.title,
        sku: variant.sku,
        quantityRule: { minimum: 1, maximum: null, increment: 1 },
        image,
        selectedOptions: variant.selectedOptions,
        product: {
          id: product.id,
          handle: product.handle,
          title: product.title,
          vendor: product.vendor,
          productType: product.productType,
          requiresSellingPlan: product.requiresSellingPlan,
          isGiftCard: product.isGiftCard,
        },
        sellingPlanAllocations: { nodes: allocations },
      },
      sellingPlanAllocation: plan
        ? {
            sellingPlan: {
              id: plan.sellingPlan.id,
              name: plan.sellingPlan.name,
            },
          }
        : null,
      discountAllocations: [],
      allDiscountAllocations: [],
      cost: {
        amountPerQuantity: money(unit),
        compareAtAmountPerQuantity: plan
          ? plan.priceAdjustments[0].compareAtPrice
          : null,
        totalAmount: money(unit * quantity),
      },
    };
  }

  // As Shopify answers: a sold-out line stays at quantity 0; codes keep
  // how they were typed but match in any case.
  function view() {
    if (!cart) return null;
    const lines = cart.lines;
    const subtotal = lines.reduce(
      (sum, l) => sum + Number(l.cost.totalAmount.amount),
      0,
    );
    const applied = cart.discountCodes
      .filter((c) => c.applicable)
      .map((c) => discount(c.code));
    const percent = applied.reduce((sum, d) => sum + (d.percent ?? 0), 0);
    const off = applied.reduce((sum, d) => sum + (d.amount ?? 0), 0);
    const discounted = Math.max(0, subtotal * (1 - percent / 100) - off);
    const used = cart.giftCard
      ? Math.min(cart.giftCard.balance, discounted)
      : 0;
    return {
      id: `gid://shopify/Cart/${cart.token}?key=${cart.key}`,
      updatedAt: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
      checkoutUrl: `https://${STORE_DOMAIN}/cart/c/${cart.token}?key=${cart.key}`,
      totalQuantity: lines.reduce((sum, l) => sum + l.quantity, 0),
      note: "",
      attributes: [],
      cost: {
        subtotalAmount: money(subtotal),
        // After gift cards, as Shopify reports it.
        totalAmount: money(discounted - used),
        checkoutChargeAmount: money(subtotal),
      },
      discountCodes: cart.discountCodes,
      appliedGiftCards: cart.giftCard
        ? [
            {
              ...giftCardFixture,
              amountUsed: money(used),
              balance: money(cart.giftCard.balance - used),
            },
          ]
        : [],
      lines: {
        nodes: lines,
      },
    };
  }

  // Lines as Shopify adds them (per the recordings): a plan-only product
  // needs one of its plans (or nothing is added), a sold-out one stays at
  // quantity 0 with a warning, and more than the stock is cut to it.
  // field: where a line's error points ("input" for cartCreate).
  function add(inputs, field = []) {
    for (const [index, input] of (inputs ?? []).entries()) {
      const found = findVariant(input.merchandiseId);
      if (!found) continue;
      const plans = plansFor(found.product, found.variant);
      if (
        found.product.requiresSellingPlan &&
        !plans.some((p) => p.sellingPlan.id === input.sellingPlanId)
      ) {
        userErrors.push({
          code: "VARIANT_REQUIRES_SELLING_PLAN",
          field: [...field, "lines", String(index)],
          message: "Variant can only be purchased with a selling plan.",
        });
        continue;
      }
      const next = line(input);
      const same = cart.lines.find(
        (l) =>
          l.merchandise.id === next.merchandise.id &&
          l.sellingPlanAllocation?.sellingPlan.id ===
            next.sellingPlanAllocation?.sellingPlan.id,
      );
      const stock = stockOf(found.product, found.variant);
      const inCart = cart.lines
        .filter((l) => l.merchandise.id === next.merchandise.id)
        .reduce((sum, l) => sum + l.quantity, 0);
      const wanted = inCart + next.quantity;
      if (stock === 0) {
        warnings.push({
          code: "MERCHANDISE_OUT_OF_STOCK",
          message: `The product '${next.merchandise.product.title}' is already sold out.`,
        });
      } else if (wanted > stock) {
        warnings.push({
          code: "MERCHANDISE_NOT_ENOUGH_STOCK",
          message: `Only ${stock} items were added to your cart due to availability.`,
        });
      }
      const quantity = Math.max(0, Math.min(next.quantity, stock - inCart));
      if (same) setQuantity(same, same.quantity + quantity);
      else {
        setQuantity(next, quantity);
        cart.lines.push(next);
      }
    }
  }

  function setQuantity(target, quantity) {
    target.quantity = quantity;
    const unit = Number(target.cost.amountPerQuantity.amount);
    target.cost.totalAmount = money(unit * quantity);
  }

  const known = (cartId) => Boolean(cart && cartId?.includes(cart.token));
  const UNKNOWN_CART = {
    code: "INVALID",
    field: ["cartId"],
    message: "The specified cart does not exist.",
  };

  // Codes as typed, applied in any case; none apply to an empty cart, or
  // below the code's minimum.
  function setCodes(codes) {
    const empty = cart.lines.every((l) => l.quantity === 0);
    const subtotal = cart.lines.reduce(
      (sum, l) => sum + Number(l.cost.totalAmount.amount),
      0,
    );
    cart.discountCodes = codes.map((code) => ({
      code,
      applicable:
        !empty && !!discount(code) && subtotal >= discount(code).minimum,
    }));
    for (const code of codes) {
      if (!discount(code)) {
        warnings.push({
          code: "DISCOUNT_NOT_FOUND",
          message: "Enter a valid discount code",
        });
      } else if (empty) {
        warnings.push({
          code: "DISCOUNT_CODE_NOT_HONOURED",
          message: `The ${code} discount code is not honoured`,
        });
      } else if (subtotal < discount(code).minimum) {
        warnings.push({
          code: "DISCOUNT_PURCHASE_NOT_IN_RANGE",
          message: `The ${code} discount code is not valid for the items in your cart`,
        });
      }
    }
  }

  // A mutation's answer. A plan-only refusal comes back without a cart on
  // create, as recorded.
  function payload(root, { refused = false } = {}) {
    const result = {
      [root]: {
        cart: refused ? null : view(),
        userErrors: [...userErrors],
        warnings: [...warnings],
      },
    };
    warnings.length = 0;
    userErrors.length = 0;
    return result;
  }

  const operations = {
    ProductCards: ({ first = 50 }) => ({
      products: {
        nodes: catalog.slice(0, first).map(card),
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    }),
    ProductCardByHandle: ({ handle }) => ({
      product: catalog.includes(handle) ? card(handle) : null,
    }),
    AllProducts: () => {
      const data = fixture("AllProducts.first-page");
      data.products.nodes = catalog.map(card);
      data.products.pageInfo = NO_PAGE;
      return data;
    },
    CollectionHandles: () => {
      const data = fixture("CollectionHandles.first-page");
      data.collections.nodes = listingHandles.map((handle) => ({ handle }));
      data.collections.pageInfo = { hasNextPage: false, endCursor: null };
      return data;
    },
    CollectionListing: ({ handle }) =>
      fixtures.has(`CollectionListing.${handle}`)
        ? fixture(`CollectionListing.${handle}`)
        : { collection: null },
    Search: ({ query }) => {
      const data = fixture("Search.tee");
      if (!lower(query).includes("tee")) {
        data.search.nodes = [];
        data.search.totalCount = 0;
      }
      return data;
    },
    PredictiveSearch: () => fixture("PredictiveSearch.test"),
    ProductContent: ({ handle }) => ({
      product: structuredClone(contents.get(handle) ?? null),
    }),
    VariantView: ({ handle, selectedOptions }) =>
      variantView(handle, selectedOptions),
    // Hydrogen's ?variant= links on product pages.
    VariantSelectedOptions: ({ id }) => {
      const found = findVariant(id);
      return {
        node: found && {
          selectedOptions: found.variant.selectedOptions,
          product: { handle: found.product.handle },
        },
      };
    },
    ProductRecommendations: ({ handle, intent = "RELATED" }) =>
      fixtures.has(`ProductRecommendations.${handle}.${lower(intent)}`)
        ? fixture(`ProductRecommendations.${handle}.${lower(intent)}`)
        : { productRecommendations: [] },
    // The header menu nests (hand-written: the dev store's menus are
    // flat); the footer is as recorded.
    Menu: ({ handle }) => {
      const name =
        handle === "main-menu" ? "Menu.synthetic-nested" : `Menu.${handle}`;
      return fixtures.has(name)
        ? fixture(name)
        : { ...fixture("Menu.footer"), menu: null };
    },
    ShopId: () => fixture("ShopId"),
    ShopLocalization: () => fixture("ShopLocalization"),
    ShopPolicies: () => fixture("ShopPolicies"),
    UrlRedirects: () => ({
      urlRedirects: {
        nodes: [],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    }),
    Cart: ({ cartId }) => ({
      cart: cart && cartId.includes(cart.token) ? view() : null,
    }),
    CartCreate: ({ input }) => {
      const previous = cart;
      cart = newCart();
      add(input.lines, ["input"]);
      if (userErrors.length) {
        cart = previous;
        return payload("cartCreate", { refused: true });
      }
      setCodes(input.discountCodes ?? []);
      return payload("cartCreate");
    },
    // An unknown cart: refused, with a new cart holding the lines (as
    // recorded).
    CartLinesAdd: ({ cartId, lines }) => {
      if (!known(cartId)) {
        cart = newCart();
        add(lines);
        userErrors.push(UNKNOWN_CART);
      } else add(lines);
      return payload("cartLinesAdd");
    },
    CartLinesUpdate: ({ cartId, lines }) => {
      if (known(cartId)) {
        for (const update of lines) {
          const target = cart.lines.find((l) => l.id === update.id);
          if (!target) continue;
          if (update.sellingPlanId !== undefined) {
            const next = line({
              merchandiseId: target.merchandise.id,
              quantity: target.quantity,
              sellingPlanId: update.sellingPlanId,
            });
            Object.assign(target, { ...next, id: target.id });
          }
          if (update.quantity !== undefined) {
            setQuantity(target, update.quantity);
          }
        }
        cart.lines = cart.lines.filter((l) => l.quantity > 0);
      }
      if (!known(cartId)) userErrors.push(UNKNOWN_CART);
      return payload("cartLinesUpdate");
    },
    CartLinesRemove: ({ cartId, lineIds }) => {
      if (known(cartId)) {
        cart.lines = cart.lines.filter((l) => !lineIds.includes(l.id));
      }
      if (!known(cartId)) userErrors.push(UNKNOWN_CART);
      return payload("cartLinesRemove");
    },
    CartDiscountCodesUpdate: ({ cartId, discountCodes }) => {
      if (known(cartId)) setCodes(discountCodes);
      else userErrors.push(UNKNOWN_CART);
      return payload("cartDiscountCodesUpdate");
    },
    // The synthetic card applies (once, and not on a cart with a gift card
    // product); any other code is refused the way Shopify does it, by not
    // applying it.
    CartGiftCardCodesAdd: ({ cartId, giftCardCodes }) => {
      if (!known(cartId)) userErrors.push(UNKNOWN_CART);
      else if (
        giftCardFixture &&
        !cart.giftCard &&
        giftCardCodes.some(
          (code) =>
            code.replace(/\s/g, "").toUpperCase() === SYNTHETIC_GIFT_CARD,
        ) &&
        !cart.lines.some((l) => l.merchandise.product.isGiftCard)
      ) {
        cart.giftCard = {
          balance:
            Number(giftCardFixture.amountUsed.amount) +
            Number(giftCardFixture.balance.amount),
        };
      }
      return payload("cartGiftCardCodesAdd");
    },
    CartGiftCardCodesRemove: ({ cartId }) => {
      if (known(cartId)) cart.giftCard = null;
      else userErrors.push(UNKNOWN_CART);
      return payload("cartGiftCardCodesRemove");
    },
    CartBuyerIdentityUpdate: ({ cartId }) => {
      if (!known(cartId)) userErrors.push(UNKNOWN_CART);
      return payload("cartBuyerIdentityUpdate");
    },
  };

  // { query, variables } -> a GraphQL response body.
  function respond({ query, variables = {} }) {
    const name = /\b(?:query|mutation)\s+(\w+)/.exec(query ?? "")?.[1];
    const operation = name && operations[name];
    if (!operation) {
      console.error(
        `[synthetic-store] no answer for ${name ?? JSON.stringify({ query, variables }).slice(0, 200)}`,
      );
      return {
        errors: [{ message: `The synthetic store has no answer for ${name}` }],
      };
    }
    return { data: operation(variables) };
  }

  return { respond, catalog };
}

// Is this request for the synthetic store's Storefront API?
export function isStorefrontRequest(url) {
  try {
    const parsed = new URL(url);
    return (
      parsed.host === STORE_DOMAIN &&
      /^\/api\/[\w-]+\/graphql\.json$/.test(parsed.pathname)
    );
  } catch {
    return false;
  }
}
