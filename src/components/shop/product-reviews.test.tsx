// @vitest-environment jsdom
import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { productJsonLd } from "@/lib/commerce/structured-data";
import { productContent } from "@/lib/commerce/testing/factories";
import type { Review } from "@/lib/reviews/types";
import { ProductReviews } from "./product-reviews";

const action = vi.hoisted(() => ({ submitReview: vi.fn() }));
vi.mock("@/lib/reviews/actions", () => action);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  action.submitReview.mockReset();
});

const review = (id: string, rating = 5): Review => ({
  id,
  rating,
  title: `Review ${id}`,
  body: `Body of review ${id}.`,
  author: "Avery E.",
  createdAt: "2026-09-30T14:00:00.000Z",
  verifiedBuyer: id === "1",
  incentivized: id === "2",
});
const summary = { rating: 4.7, count: 3 };

describe("ProductReviews", () => {
  it("says when a reviewer got an incentive", () => {
    render(
      <ProductReviews
        handle="synthetic"
        summary={summary}
        page={{ reviews: [review("1"), review("2")], page: 1, hasMore: false }}
        open={false}
      />,
    );
    const [first, second] = screen.getAllByRole("article");
    expect(first.textContent).not.toContain("incentive");
    expect(second.textContent).toContain(
      "This reviewer received an incentive for this review.",
    );
  });

  it("shows the rating and the first reviews", () => {
    render(
      <ProductReviews
        handle="test-electrolytes"
        summary={summary}
        page={{
          reviews: [review("1"), review("2", 4)],
          page: 1,
          hasMore: false,
        }}
        open={false}
      />,
    );
    const section = screen.getByRole("region", { name: "Reviews" });
    expect(section.textContent).toContain("4.7 out of 5 stars, 3 reviews");
    const items = within(
      screen.getByRole("list", { name: "Reviews" }),
    ).getAllByRole("article");
    expect(
      items.map(
        (item) =>
          item.getAttribute("aria-labelledby") &&
          within(item).getByRole("heading").textContent,
      ),
    ).toEqual(["Review 1", "Review 2"]);
    expect(items[0].textContent).toContain(
      "5 out of 5 stars · Avery E. · Sep 30, 2026 · Verified buyer",
    );
    expect(screen.queryByRole("button", { name: "More reviews" })).toBeNull();
    expect(screen.queryByRole("form")).toBeNull();
  });

  it("loads more reviews, announces them and moves focus to the first new one", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          reviews: [review("3"), review("4")],
          page: 2,
          hasMore: false,
        }),
      ),
    );
    render(
      <ProductReviews
        handle="test-electrolytes"
        summary={summary}
        page={{ reviews: [review("1"), review("2")], page: 1, hasMore: true }}
        open={false}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "More reviews" }));
    expect(fetch).toHaveBeenCalledWith(
      "/api/reviews?handle=test-electrolytes&page=2",
    );
    await waitFor(() =>
      expect(document.activeElement?.textContent).toContain("Review 3"),
    );
    expect(screen.getByText("2 more reviews shown.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "More reviews" })).toBeNull();
  });

  it("says when there are none yet, and offers the form when reviews are open", () => {
    render(
      <ProductReviews
        handle="test-electrolytes"
        summary={null}
        page={{ reviews: [], page: 1, hasMore: false }}
        open
      />,
    );
    expect(screen.getByText("No reviews yet.")).toBeTruthy();
    expect(screen.getByRole("form", { name: "Write a review" })).toBeTruthy();
  });

  it("renders nothing without reviews or a way to write one", () => {
    const { container } = render(
      <ProductReviews
        handle="test-electrolytes"
        summary={null}
        page={{ reviews: [], page: 1, hasMore: false }}
        open={false}
      />,
    );
    expect(container.textContent).toBe("");
  });
});

describe("the review form", () => {
  const renderForm = () =>
    render(
      <ProductReviews
        handle="test-electrolytes"
        summary={null}
        page={{ reviews: [], page: 1, hasMore: false }}
        open
      />,
    );

  it("marks invalid fields, keeps what was typed and focuses the first one", async () => {
    action.submitReview.mockImplementation(async (_prev, form: FormData) => ({
      status: "error",
      message: "Check the highlighted fields.",
      fieldErrors: { body: "Write at least 20 characters." },
      values: Object.fromEntries(
        [...form.entries()].map(([k, v]) => [k, String(v)]),
      ),
    }));
    renderForm();
    await userEvent.click(screen.getByRole("radio", { name: "4 stars" }));
    await userEvent.type(screen.getByLabelText("Title"), "Okay");
    await userEvent.type(
      screen.getByLabelText("Review"),
      "Fine, but short and twenty",
    );
    await userEvent.type(screen.getByLabelText(/^Name/), "Avery Example");
    await userEvent.type(screen.getByLabelText("Email"), "avery@example.test");
    await act(async () => {
      await userEvent.click(
        screen.getByRole("button", { name: "Send review" }),
      );
    });
    await waitFor(() =>
      expect(screen.getByLabelText("Review").getAttribute("aria-invalid")).toBe(
        "true",
      ),
    );
    expect(screen.getByLabelText("Review")).toHaveProperty(
      "value",
      "Fine, but short and twenty",
    );
    expect(screen.getByRole("radio", { name: "4 stars" })).toHaveProperty(
      "checked",
      true,
    );
    expect(document.activeElement).toBe(screen.getByLabelText("Review"));
    // The honeypot isn't something people see or reach.
    const trap = screen.getByLabelText("Website", { selector: "input" });
    expect(trap.closest("[hidden]")).not.toBeNull();
    expect(trap.tabIndex).toBe(-1);
  });

  it("says thanks once sent", async () => {
    action.submitReview.mockResolvedValue({
      status: "sent",
      message: "Thanks for your review. It will appear once it's been checked.",
    });
    renderForm();
    await userEvent.click(screen.getByRole("radio", { name: "5 stars" }));
    await userEvent.type(screen.getByLabelText("Title"), "Great");
    await userEvent.type(
      screen.getByLabelText("Review"),
      "Mixes well and tastes good every time.",
    );
    await userEvent.type(screen.getByLabelText(/^Name/), "Avery Example");
    await userEvent.type(screen.getByLabelText("Email"), "avery@example.test");
    await userEvent.click(screen.getByRole("button", { name: "Send review" }));
    const thanks = await screen.findByRole("status");
    expect(thanks.textContent).toBe(
      "Thanks for your review. It will appear once it's been checked.",
    );
    await waitFor(() => expect(document.activeElement).toBe(thanks));
  });
});

describe("AggregateRating in JSON-LD", () => {
  const product = {
    ...productContent("electrolytes"),
    reviews: summary,
    supplement: null,
  };

  it("is there only with reviews the page shows", () => {
    const shown = productJsonLd(product, "https://shop.test/p", null, null, {
      summary,
      reviews: [review("1")],
    }) as Record<string, unknown>;
    expect(shown.aggregateRating).toEqual({
      "@type": "AggregateRating",
      ratingValue: 4.7,
      reviewCount: 3,
      bestRating: 5,
      worstRating: 1,
    });
    expect(shown.review).toEqual([
      expect.objectContaining({
        "@type": "Review",
        author: { "@type": "Person", name: "Avery E." },
        reviewBody: "Body of review 1.",
        datePublished: "2026-09-30",
      }),
    ]);
    // A rating with no reviews on the page (no review app): left out.
    const hidden = productJsonLd(product, "https://shop.test/p", null, null, {
      summary,
      reviews: [],
    });
    expect(hidden).not.toHaveProperty("aggregateRating");
  });
});
