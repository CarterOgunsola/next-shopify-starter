// Shared by the review form and its server action.

export const REVIEW_HONEYPOT = "website";

export type ReviewFormState =
  | { status: "idle" }
  | { status: "sent"; message: string }
  | {
      status: "error";
      message: string;
      fieldErrors?: Record<string, string>;
      // What was submitted, so the form can show it again.
      values?: Record<string, string>;
    };

export const REVIEW_FIELDS = [
  "rating",
  "title",
  "body",
  "name",
  "email",
] as const;
