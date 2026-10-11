// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NewsletterSignup } from "./newsletter-signup";

const mocks = vi.hoisted(() => ({
  identify: vi.fn(),
  track: vi.fn(),
}));

vi.mock("@/lib/marketing/actions", () => ({
  subscribeToNewsletter: async () => ({ status: "success" }),
}));
vi.mock("@/lib/marketing/klaviyo-browser", () => ({
  klaviyoIdentify: mocks.identify,
}));
vi.mock("@/lib/analytics/track", () => ({ track: mocks.track }));

afterEach(cleanup);

describe("NewsletterSignup", () => {
  it("identifies the new subscriber to Klaviyo after success", async () => {
    render(<NewsletterSignup source="footer" />);

    await userEvent.type(
      screen.getByLabelText("Email"),
      " test.subscriber@example.com ",
    );
    await userEvent.click(screen.getByRole("button", { name: "Sign up" }));

    expect(await screen.findByRole("status")).toHaveProperty(
      "textContent",
      "Thanks for signing up.",
    );
    expect(mocks.identify).toHaveBeenCalledWith("test.subscriber@example.com");
    expect(mocks.track).toHaveBeenCalledWith("newsletter_signup", {
      source: "footer",
      channels: ["email"],
    });
  });
});
