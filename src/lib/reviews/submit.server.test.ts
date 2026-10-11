import { describe, expect, it, vi } from "vitest";
import { submitReviewForm } from "./submit.server";
import { noReviews, type ReviewsProvider } from "./types";

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};
const good = {
  handle: "test-electrolytes",
  rating: "5",
  title: "Easy to drink",
  body: "Mixes well and the lemon isn't too sweet.",
  name: "Avery Example",
  email: "avery@example.test",
};
const provider = (): ReviewsProvider & {
  submit: ReturnType<typeof vi.fn>;
} => ({
  list: noReviews.list,
  submit: vi.fn(async () => ({ ok: true as const })),
});
const deps = (over = {}) => ({
  allow: () => true,
  clientKey: "203.0.113.7",
  provider: provider(),
  productId: async (handle: string) =>
    handle === "test-electrolytes" ? "gid://shopify/Product/5550001" : null,
  ...over,
});

describe("submitReviewForm", () => {
  it("sends a valid review for the product, by its Shopify id", async () => {
    const d = deps();
    expect(await submitReviewForm(form(good), d)).toEqual({
      status: "sent",
      message: "Thanks for your review. It will appear once it's been checked.",
    });
    expect(d.provider.submit).toHaveBeenCalledWith({
      productId: "5550001",
      name: "Avery Example",
      email: "avery@example.test",
      rating: 5,
      title: "Easy to drink",
      body: "Mixes well and the lemon isn't too sweet.",
    });
  });

  it("marks each problem in our words and sends back what was typed", async () => {
    const d = deps();
    const result = await submitReviewForm(
      form({
        ...good,
        rating: "0",
        body: "Too short",
        email: "nope",
        title: "<b>",
        name: "avery@example.test",
      }),
      d,
    );
    expect(result).toMatchObject({
      status: "error",
      fieldErrors: {
        rating: "Choose a rating from 1 to 5 stars.",
        body: "Write at least 20 characters.",
        email: "Enter a valid email address.",
        title: "Remove the < and > characters.",
        // Names are shown with the review.
        name: "Enter your name, not your email.",
      },
      values: { body: "Too short", email: "nope" },
    });
    expect(d.provider.submit).not.toHaveBeenCalled();
  });

  it("pretends to accept a bot's review and sends nothing", async () => {
    const d = deps();
    expect(
      await submitReviewForm(form({ ...good, website: "spam.example" }), d),
    ).toMatchObject({ status: "sent" });
    expect(d.provider.submit).not.toHaveBeenCalled();
  });

  it("limits how often one visitor can send", async () => {
    const d = deps({ allow: () => false });
    expect(await submitReviewForm(form(good), d)).toMatchObject({
      status: "error",
      message: "Too many reviews sent. Try again in a few minutes.",
    });
    expect(d.provider.submit).not.toHaveBeenCalled();
  });

  it("refuses a product that isn't published", async () => {
    expect(
      await submitReviewForm(form({ ...good, handle: "test-gone" }), deps()),
    ).toMatchObject({
      status: "error",
      message: "This product can't be reviewed.",
    });
  });

  it("says reviews aren't open without a review app, and keeps the text", async () => {
    expect(
      await submitReviewForm(form(good), deps({ provider: noReviews })),
    ).toMatchObject({
      status: "error",
      message: "Reviews aren't open yet.",
      values: { body: good.body },
    });
  });
});
