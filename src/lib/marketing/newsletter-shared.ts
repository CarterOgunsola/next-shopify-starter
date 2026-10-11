// Shared by the sign-up form (client) and the server action.

export type SignupState =
  | { status: "idle" }
  | { status: "success" }
  | { status: "error"; message: string };

export const HONEYPOT_FIELD = "website";
