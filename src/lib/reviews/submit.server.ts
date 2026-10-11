import "server-only";
import { z } from "zod";
import { isValidHandle } from "@/lib/commerce/handles";
import { REVIEW_FIELDS, REVIEW_HONEYPOT, type ReviewFormState } from "./form";
import { productNumber } from "./reviews.server";
import type { ReviewsProvider } from "./types";

const noTags = (value: string) => !/[<>]/.test(value);
const schema = z.object({
  handle: z.string().refine(isValidHandle),
  rating: z.coerce
    .number()
    .int()
    .min(1, "Choose a rating from 1 to 5 stars.")
    .max(5, "Choose a rating from 1 to 5 stars."),
  title: z
    .string()
    .trim()
    .min(1, "Give your review a title.")
    .max(100, "Keep the title under 100 characters.")
    .refine(noTags, "Remove the < and > characters."),
  body: z
    .string()
    .trim()
    .min(20, "Write at least 20 characters.")
    .max(5000, "Keep the review under 5,000 characters.")
    .refine(noTags, "Remove the < and > characters."),
  name: z
    .string()
    .trim()
    .min(1, "Enter your name.")
    .max(80, "Keep your name under 80 characters.")
    .refine(noTags, "Remove the < and > characters.")
    // It's shown with the review: never an email address.
    .refine((name) => !name.includes("@"), "Enter your name, not your email."),
  email: z.email("Enter a valid email address.").max(254),
});

export type SubmitDeps = {
  allow: (key: string) => boolean;
  clientKey: string;
  provider: ReviewsProvider;
  // The product's Shopify id for a published product's handle.
  productId: (handle: string) => Promise<string | null>;
};

// A review from the product page's form. The email goes to the review app
// only (for its verification and moderation), never to logs.
export async function submitReviewForm(
  form: FormData,
  { allow, clientKey, provider, productId }: SubmitDeps,
): Promise<ReviewFormState> {
  const values = Object.fromEntries(
    REVIEW_FIELDS.map((name) => [name, String(form.get(name) ?? "")]),
  );
  // Bots fill every field: pretend it worked.
  if (form.get(REVIEW_HONEYPOT)) {
    return { status: "sent", message: SENT };
  }
  const parsed = schema.safeParse({
    ...values,
    handle: String(form.get("handle") ?? ""),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[String(issue.path[0])] ??= issue.message;
    }
    return {
      status: "error",
      message: "Check the highlighted fields.",
      fieldErrors,
      values,
    };
  }
  if (!allow(clientKey)) {
    return {
      status: "error",
      message: "Too many reviews sent. Try again in a few minutes.",
      values,
    };
  }
  const gid = await productId(parsed.data.handle);
  const id = gid && productNumber(gid);
  if (!id) {
    return {
      status: "error",
      message: "This product can't be reviewed.",
      values,
    };
  }
  const result = await provider.submit({
    productId: id,
    name: parsed.data.name,
    email: parsed.data.email,
    rating: parsed.data.rating,
    title: parsed.data.title,
    body: parsed.data.body,
  });
  if (result.ok) return { status: "sent", message: SENT };
  return {
    status: "error",
    message:
      result.reason === "unavailable"
        ? "Reviews aren't open yet."
        : "Your review didn't send. Try again.",
    values,
  };
}

const SENT = "Thanks for your review. It will appear once it's been checked.";
