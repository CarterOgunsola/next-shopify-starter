import "server-only";
import {
  createCustomerAccountClient,
  gql,
} from "@shopify/hydrogen/customer-account";
import type { ShopifyRequestContext } from "@shopify/hydrogen";
import type {
  AddressInput,
  CustomerAddress,
  CustomerProfile,
  OrderDetail,
  OrderSummary,
  Page,
} from "../../types";
import { legacyId } from "../ids";

// Customer Account API reads and changes for the signed-in customer. The
// data is the customer's own and is only rendered to them; never logged or
// cached.

export type CustomerCall = {
  shopId: string;
  requestContext: ShopifyRequestContext;
  accessToken: string;
};

// The API answered with errors (not userErrors). Messages carry each
// error's code, field path and required access only: never its message,
// which can quote customer data.
export class CustomerAccountError extends Error {
  constructor(operation: string, errors: readonly unknown[]) {
    const described = errors.map(describeGraphqlError);
    super(
      `Customer Account ${operation}: ${described.join("; ") || "no data"}`,
    );
    this.name = "CustomerAccountError";
  }
}

function describeGraphqlError(error: unknown): string {
  const { extensions, path } = (error ?? {}) as {
    extensions?: { code?: unknown; requiredAccess?: unknown };
    path?: unknown;
  };
  const code = typeof extensions?.code === "string" ? extensions.code : "error";
  const at = Array.isArray(path)
    ? ` at ${path.map((part) => (typeof part === "number" ? "[]" : String(part))).join(".")}`
    : "";
  const access =
    typeof extensions?.requiredAccess === "string"
      ? ` (needs ${extensions.requiredAccess})`
      : "";
  return `${code}${at}${access}`;
}

// A failed Customer Account call for the logs, without tokens or customer
// data: the error's class, Shopify's HTTP status and request id, our
// GraphQL summary, the API origin sent, and a cause's class.
export function describeCustomerError(
  error: unknown,
  call?: Pick<CustomerCall, "requestContext">,
): string {
  if (!(error instanceof Error)) return typeof error;
  const { status, requestId } = error as {
    status?: number;
    requestId?: string;
  };
  const parts = [error.name];
  if (error instanceof CustomerAccountError) parts.push(error.message);
  else if (error.name === "Error" || error.name === "TypeError") {
    // Hydrogen's own setup checks (origin, shop id, version); never data.
    parts.push(error.message.slice(0, 160));
  }
  if (status !== undefined) parts.push(`status ${status}`);
  if (requestId) parts.push(`request ${requestId}`);
  if (error.cause instanceof Error) parts.push(`cause ${error.cause.name}`);
  const url = call?.requestContext.url;
  if (url) parts.push(`origin ${new URL(url).origin}`);
  return parts.join(", ");
}

// A change Shopify refused, with its userErrors (field paths and codes).
export type UserError = {
  code: string | null;
  field: readonly string[] | null;
  message: string;
};

// What Shopify said when it refused a call outright (Hydrogen drops the
// body of a non-2xx answer): at most 300 characters, with email addresses
// and anything token-like removed.
export function refusalText(body: string): string {
  return body
    .replace(/[^\s"'<>@]+@[^\s"'<>@]+/g, "[email]")
    .replace(/\b(?:shcat|atkn|Bearer)[\s_][^\s"']+/gi, "[token]")
    .replace(/[A-Za-z0-9+/_.=-]{40,}/g, "[token]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

const loggingFetch: typeof fetch = async (input, init) => {
  const response = await fetch(input, init);
  if (!response.ok) {
    const body = await response
      .clone()
      .text()
      .catch(() => "");
    console.warn(
      `[accounts] Customer Account API ${response.status} said: ${refusalText(body) || "(no body)"}`,
    );
  }
  return response;
};

async function request<
  const Doc extends Parameters<
    ReturnType<typeof createCustomerAccountClient>["graphql"]
  >[0],
>(
  call: CustomerCall,
  operation: string,
  doc: Doc,
  variables?: Record<string, unknown>,
) {
  const client = createCustomerAccountClient({
    shopId: call.shopId,
    requestContext: call.requestContext,
    fetch: loggingFetch,
  });
  const result = await client.graphql(doc, {
    accessToken: call.accessToken,
    ...(variables ? { variables } : {}),
  } as never);
  if (result.errors?.length || !result.data) {
    throw new CustomerAccountError(operation, result.errors ?? []);
  }
  return result.data;
}

const OrderSummaryFragment = gql(`
  fragment OrderSummary on Order {
    id
    name
    processedAt
    financialStatus
    fulfillmentStatus
    statusPageUrl
    totalPrice {
      amount
      currencyCode
    }
    # The item count, summed from the lines (the live API has no line
    # items summary). Aliased so it can't clash with an order's own
    # lineItems selection.
    itemQuantities: lineItems(first: 50) {
      nodes {
        quantity
      }
    }
  }
`);

const AddressFragment = gql(`
  fragment Address on CustomerAddress {
    id
    firstName
    lastName
    company
    address1
    address2
    city
    zoneCode
    countryCode
    zip
    phoneNumber
    formatted(withName: true, withCompany: true)
  }
`);

type OrderSummaryData = {
  id: string;
  name: string;
  processedAt: unknown;
  financialStatus?: string | null;
  fulfillmentStatus: string;
  statusPageUrl: unknown;
  totalPrice: { amount: unknown; currencyCode: string };
  itemQuantities?: { nodes: { quantity: number }[] } | null;
};

const money = (value: { amount: unknown; currencyCode: string }) => ({
  amount: String(value.amount),
  currencyCode: value.currencyCode,
});

function httpsOrNull(value: unknown): string | null {
  const url = String(value ?? "");
  return url.startsWith("https://") ? url : null;
}

function toOrderSummary(order: OrderSummaryData): OrderSummary {
  return {
    id: order.id,
    legacyId: legacyId(order.id) ?? order.id,
    name: order.name,
    processedAt: String(order.processedAt),
    financialStatus: order.financialStatus ?? null,
    fulfillmentStatus: order.fulfillmentStatus,
    total: money(order.totalPrice),
    itemCount: (order.itemQuantities?.nodes ?? []).reduce(
      (sum, line) => sum + line.quantity,
      0,
    ),
    statusPageUrl: httpsOrNull(order.statusPageUrl),
  };
}

type AddressData = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  company?: string | null;
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  zoneCode?: string | null;
  countryCode?: string | null;
  zip?: string | null;
  phoneNumber?: string | null;
  formatted: readonly string[];
};

function toAddress(
  address: AddressData,
  defaultId: string | null,
): CustomerAddress {
  return {
    id: address.id,
    firstName: address.firstName ?? null,
    lastName: address.lastName ?? null,
    company: address.company ?? null,
    address1: address.address1 ?? null,
    address2: address.address2 ?? null,
    city: address.city ?? null,
    zoneCode: address.zoneCode ?? null,
    countryCode: address.countryCode ?? null,
    zip: address.zip ?? null,
    phoneNumber: address.phoneNumber ?? null,
    formatted: [...address.formatted],
    isDefault: address.id === defaultId,
  };
}

// --- Reads

export const AccountQuery = gql(
  `
    query Account {
      customer {
        firstName
        lastName
        emailAddress {
          emailAddress
        }
        orders(first: 20, sortKey: PROCESSED_AT, reverse: true) {
          nodes {
            ...OrderSummary
          }
        }
      }
    }
  `,
  [OrderSummaryFragment],
);

export async function fetchAccount(
  shopId: string,
  requestContext: ShopifyRequestContext,
  accessToken: string,
): Promise<{ customer: CustomerProfile; orders: OrderSummary[] } | null> {
  const call = { shopId, requestContext, accessToken };
  const data = await request(call, "Account", AccountQuery).catch(
    (error: unknown) => {
      console.warn(
        `[accounts] account query failed: ${describeCustomerError(error, call)}`,
      );
      return null;
    },
  );
  if (!data) return null;
  if (!data.customer) {
    console.warn("[accounts] account query answered no customer.");
    return null;
  }
  const { customer } = data;
  return {
    customer: {
      firstName: customer.firstName ?? null,
      lastName: customer.lastName ?? null,
      email: customer.emailAddress?.emailAddress ?? null,
    },
    orders: customer.orders.nodes.map(toOrderSummary),
  };
}

export const ORDERS_PAGE_SIZE = 10;

export const OrdersQuery = gql(
  `
    query Orders($first: Int, $after: String, $last: Int, $before: String) {
      customer {
        orders(
          first: $first
          after: $after
          last: $last
          before: $before
          sortKey: PROCESSED_AT
          reverse: true
        ) {
          nodes {
            ...OrderSummary
          }
          pageInfo {
            hasNextPage
            hasPreviousPage
            startCursor
            endCursor
          }
        }
      }
    }
  `,
  [OrderSummaryFragment],
);

export async function fetchOrders(
  call: CustomerCall,
  page: { after?: string; before?: string },
): Promise<Page<OrderSummary>> {
  const variables = page.before
    ? { last: ORDERS_PAGE_SIZE, before: page.before }
    : { first: ORDERS_PAGE_SIZE, after: page.after };
  const { customer } = await request(call, "Orders", OrdersQuery, variables);
  const { nodes, pageInfo } = customer.orders;
  return {
    items: nodes.map(toOrderSummary),
    nextCursor: pageInfo.hasNextPage ? (pageInfo.endCursor ?? null) : null,
    previousCursor: pageInfo.hasPreviousPage
      ? (pageInfo.startCursor ?? null)
      : null,
  };
}

// What a discount took off part of an order (a line or its shipping), and
// which discount it was. An order's discounts are these, added up per
// discount (the live API has no applied-discounts summary).
const DiscountAllocationFragment = gql(`
  fragment DiscountAllocationParts on DiscountAllocation {
    allocatedAmount {
      amount
      currencyCode
    }
    discountApplication {
      ... on DiscountCodeApplication {
        code
      }
      ... on AutomaticDiscountApplication {
        title
      }
      ... on ManualDiscountApplication {
        title
      }
      ... on ScriptDiscountApplication {
        title
      }
    }
  }
`);

type Allocation = {
  allocatedAmount: { amount: unknown; currencyCode: string };
  discountApplication: { code?: string; title?: string };
};

// Decimal strings added without floating point, at the larger precision.
function addAmounts(a: string, b: string): string {
  const places = Math.max(
    a.split(".")[1]?.length ?? 0,
    b.split(".")[1]?.length ?? 0,
  );
  const units = (value: string) => {
    const [whole, fraction = ""] = value.split(".");
    return BigInt(whole + fraction.padEnd(places, "0"));
  };
  const sum = (units(a) + units(b)).toString().padStart(places + 1, "0");
  return places ? `${sum.slice(0, -places)}.${sum.slice(-places)}` : sum;
}

// Each discount once, with what it took off in total, in first-seen order.
export function appliedDiscounts(
  allocations: readonly Allocation[],
): { title: string; amount: { amount: string; currencyCode: string } }[] {
  const byTitle = new Map<
    string,
    { title: string; amount: { amount: string; currencyCode: string } }
  >();
  for (const { allocatedAmount, discountApplication } of allocations) {
    const title =
      discountApplication.code || discountApplication.title || "Discount";
    const amount = money(allocatedAmount);
    const seen = byTitle.get(title);
    byTitle.set(
      title,
      seen
        ? {
            title,
            amount: {
              amount: addAmounts(seen.amount.amount, amount.amount),
              currencyCode: amount.currencyCode,
            },
          }
        : { title, amount },
    );
  }
  return [...byTitle.values()];
}

export const OrderQuery = gql(
  `
    query Order($id: ID!) {
      order(id: $id) {
        ...OrderSummary
        subtotal {
          amount
          currencyCode
        }
        totalTax {
          amount
          currencyCode
        }
        shippingLine {
          title
          originalPrice {
            amount
            currencyCode
          }
        }
        totalShipping {
          amount
          currencyCode
        }
        shippingDiscountAllocations {
          ...DiscountAllocationParts
        }
        lineItems(first: 100) {
          nodes {
            id
            title
            variantTitle
            quantity
            discountAllocations {
              ...DiscountAllocationParts
            }
            price {
              amount
              currencyCode
            }
            totalPrice {
              amount
              currencyCode
            }
            image {
              url
              altText
            }
          }
        }
        fulfillments(first: 20) {
          nodes {
            status
            latestShipmentStatus
            estimatedDeliveryAt
            fulfillmentLineItems(first: 100) {
              nodes {
                quantity
              }
            }
            trackingInformation {
              company
              number
              url
            }
          }
        }
        shippingAddress {
          formatted(withName: true, withCompany: true)
        }
        billingAddress {
          formatted(withName: true, withCompany: true)
        }
      }
    }
  `,
  [OrderSummaryFragment, DiscountAllocationFragment],
);

// The order, if it's the signed-in customer's. The Customer Account API
// only returns the customer's own orders, so someone else's id is null.
export async function fetchOrder(
  call: CustomerCall,
  orderId: string,
): Promise<OrderDetail | null> {
  const { order } = await request(call, "Order", OrderQuery, { id: orderId });
  if (!order) return null;
  const shipping = order.shippingLine?.originalPrice ?? order.totalShipping;
  return {
    ...toOrderSummary(order),
    lines: order.lineItems.nodes.map((line) => ({
      id: line.id,
      title: line.title,
      variantTitle: line.variantTitle || null,
      quantity: line.quantity,
      price: money(
        line.price ?? {
          amount: "0",
          currencyCode: order.totalPrice.currencyCode,
        },
      ),
      total: money(
        line.totalPrice ?? {
          amount: "0",
          currencyCode: order.totalPrice.currencyCode,
        },
      ),
      image: line.image
        ? { url: String(line.image.url), altText: line.image.altText ?? null }
        : null,
    })),
    discounts: appliedDiscounts([
      ...order.lineItems.nodes.flatMap((line) => line.discountAllocations),
      ...order.shippingDiscountAllocations,
    ] as Allocation[]),
    subtotal: order.subtotal ? money(order.subtotal) : null,
    shipping: shipping
      ? { title: order.shippingLine?.title ?? null, amount: money(shipping) }
      : null,
    tax: order.totalTax ? money(order.totalTax) : null,
    fulfillments: order.fulfillments.nodes.map((fulfillment) => ({
      status: fulfillment.status ?? null,
      shipmentStatus: fulfillment.latestShipmentStatus ?? null,
      estimatedDeliveryAt: fulfillment.estimatedDeliveryAt ?? null,
      itemCount: fulfillment.fulfillmentLineItems.nodes.reduce(
        (sum, item) => sum + (item.quantity ?? 0),
        0,
      ),
      tracking: fulfillment.trackingInformation.map((tracking) => ({
        company: tracking.company ?? null,
        number: tracking.number ?? null,
        url: httpsOrNull(tracking.url),
      })),
    })),
    shippingAddress: order.shippingAddress
      ? [...order.shippingAddress.formatted]
      : null,
    billingAddress: order.billingAddress
      ? [...order.billingAddress.formatted]
      : null,
  };
}

export const ProfileQuery = gql(`
  query Profile {
    customer {
      firstName
      lastName
      emailAddress {
        emailAddress
      }
    }
  }
`);

export async function fetchProfile(
  call: CustomerCall,
): Promise<CustomerProfile> {
  const { customer } = await request(call, "Profile", ProfileQuery);
  return {
    firstName: customer.firstName ?? null,
    lastName: customer.lastName ?? null,
    email: customer.emailAddress?.emailAddress ?? null,
  };
}

export const AddressesQuery = gql(
  `
    query Addresses {
      customer {
        defaultAddress {
          id
        }
        addresses(first: 50) {
          nodes {
            ...Address
          }
        }
      }
    }
  `,
  [AddressFragment],
);

// The default address first, then the rest as Shopify orders them.
export async function fetchAddresses(
  call: CustomerCall,
): Promise<CustomerAddress[]> {
  const { customer } = await request(call, "Addresses", AddressesQuery);
  const defaultId = customer.defaultAddress?.id ?? null;
  return customer.addresses.nodes
    .map((address) => toAddress(address, defaultId))
    .sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
}

// --- Changes. Each returns Shopify's userErrors (empty when it worked).

export const CustomerUpdateMutation = gql(`
  mutation CustomerUpdate($input: CustomerUpdateInput!) {
    customerUpdate(input: $input) {
      userErrors {
        code
        field
        message
      }
    }
  }
`);

export async function updateProfile(
  call: CustomerCall,
  input: { firstName: string; lastName: string },
): Promise<UserError[]> {
  const data = await request(call, "CustomerUpdate", CustomerUpdateMutation, {
    input,
  });
  return [...(data.customerUpdate?.userErrors ?? [])];
}

const toAddressInput = (input: AddressInput) => ({
  firstName: input.firstName,
  lastName: input.lastName,
  company: input.company,
  address1: input.address1,
  address2: input.address2,
  city: input.city,
  zoneCode: input.zoneCode,
  countryCode: input.countryCode,
  zip: input.zip,
  phoneNumber: input.phoneNumber,
});

export const AddressCreateMutation = gql(`
  mutation CustomerAddressCreate(
    $address: CustomerAddressInput!
    $defaultAddress: Boolean
  ) {
    customerAddressCreate(address: $address, defaultAddress: $defaultAddress) {
      customerAddress {
        id
      }
      userErrors {
        code
        field
        message
      }
    }
  }
`);

export async function createAddress(
  call: CustomerCall,
  input: AddressInput,
  makeDefault: boolean,
): Promise<UserError[]> {
  const data = await request(
    call,
    "CustomerAddressCreate",
    AddressCreateMutation,
    {
      address: toAddressInput(input),
      ...defaultFlag(makeDefault),
    },
  );
  return [...(data.customerAddressCreate?.userErrors ?? [])];
}

export const AddressUpdateMutation = gql(`
  mutation CustomerAddressUpdate(
    $addressId: ID!
    $address: CustomerAddressInput
    $defaultAddress: Boolean
  ) {
    customerAddressUpdate(
      addressId: $addressId
      address: $address
      defaultAddress: $defaultAddress
    ) {
      userErrors {
        code
        field
        message
      }
    }
  }
`);

// defaultAddress only when making an address the default: false would ask
// Shopify to demote it, which it refuses for the current default
// (DEMOTING_CUSTOMER_DEFAULT_ADDRESS_NOT_ALLOWED) when that's the one
// being edited.
const defaultFlag = (makeDefault: boolean) =>
  makeDefault ? { defaultAddress: true } : {};

// address null: only the default flag changes.
export async function updateAddress(
  call: CustomerCall,
  addressId: string,
  input: AddressInput | null,
  makeDefault: boolean,
): Promise<UserError[]> {
  const data = await request(
    call,
    "CustomerAddressUpdate",
    AddressUpdateMutation,
    {
      addressId,
      ...(input ? { address: toAddressInput(input) } : {}),
      ...defaultFlag(makeDefault),
    },
  );
  return [...(data.customerAddressUpdate?.userErrors ?? [])];
}

export const AddressDeleteMutation = gql(`
  mutation CustomerAddressDelete($addressId: ID!) {
    customerAddressDelete(addressId: $addressId) {
      deletedAddressId
      userErrors {
        code
        field
        message
      }
    }
  }
`);

export async function deleteAddress(
  call: CustomerCall,
  addressId: string,
): Promise<UserError[]> {
  const data = await request(
    call,
    "CustomerAddressDelete",
    AddressDeleteMutation,
    {
      addressId,
    },
  );
  return [...(data.customerAddressDelete?.userErrors ?? [])];
}

// Every Customer Account document this site sends, by operation, for the
// live schema check (customer-schema.ts).
export const CUSTOMER_DOCUMENTS = {
  Account: AccountQuery,
  Orders: OrdersQuery,
  Order: OrderQuery,
  Profile: ProfileQuery,
  Addresses: AddressesQuery,
  CustomerUpdate: CustomerUpdateMutation,
  AddressCreate: AddressCreateMutation,
  AddressUpdate: AddressUpdateMutation,
  AddressDelete: AddressDeleteMutation,
};
