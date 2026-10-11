// Shared by the Notify me form (client) and its server action.

export type BackInStockState =
  | { status: "idle" }
  | { status: "success"; message: string }
  // field: the error is about the email address (shown on that field).
  | { status: "error"; message: string; email?: string; field?: "email" };
