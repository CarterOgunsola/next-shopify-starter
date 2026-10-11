// Errors from Storefront API calls. Messages carry the operation name and
// codes, never variables (they can hold emails or cart ids).

export type ShopifyErrorDetails = {
  status?: number;
  requestId?: string;
  codes?: string[];
  cause?: unknown;
};

export class ShopifyError extends Error {
  readonly operation: string;
  readonly status?: number;
  readonly requestId?: string;
  readonly codes: string[];

  constructor(
    operation: string,
    reason: string,
    details: ShopifyErrorDetails = {},
  ) {
    super(`Shopify ${operation}: ${reason}`, { cause: details.cause });
    this.name = "ShopifyError";
    this.operation = operation;
    this.status = details.status;
    this.requestId = details.requestId;
    this.codes = details.codes ?? [];
  }
}

// Worth retrying later: throttling, timeouts, network failures, 5xx.
export class ShopifyTransientError extends ShopifyError {
  constructor(
    operation: string,
    reason: string,
    details?: ShopifyErrorDetails,
  ) {
    super(operation, reason, details);
    this.name = "ShopifyTransientError";
  }
}

// Won't succeed on retry: bad token (401/403), security rejection (430),
// invalid query, other GraphQL errors.
export class ShopifyRequestError extends ShopifyError {
  constructor(
    operation: string,
    reason: string,
    details?: ShopifyErrorDetails,
  ) {
    super(operation, reason, details);
    this.name = "ShopifyRequestError";
  }
}

export type UserError = {
  code?: string | null;
  field?: readonly string[] | null;
  message: string;
};

// A mutation ran but Shopify rejected the input (cart and discount
// userErrors). Callers map codes to our own messages.
export class ShopifyUserError extends ShopifyError {
  readonly userErrors: UserError[];

  constructor(operation: string, userErrors: readonly UserError[]) {
    const codes = userErrors.map((error) => error.code ?? "UNKNOWN");
    super(operation, `user errors ${codes.join(", ")}`, { codes });
    this.name = "ShopifyUserError";
    this.userErrors = [...userErrors];
  }
}

// The cart is unknown, expired or already checked out.
export class CartNotFoundError extends ShopifyError {
  constructor(operation: string) {
    super(operation, "cart not found");
    this.name = "CartNotFoundError";
  }
}

export function assertNoUserErrors(
  operation: string,
  userErrors: readonly UserError[] | null | undefined,
): void {
  if (userErrors?.length) throw new ShopifyUserError(operation, userErrors);
}

export function isTransient(status: number): boolean {
  return status === 429 || status >= 500;
}
