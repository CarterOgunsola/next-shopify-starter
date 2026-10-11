// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NotifyMe } from "./notify-me";

const marketing = vi.hoisted(() => ({ notifyWhenBackInStock: vi.fn() }));
vi.mock("@/lib/marketing/actions", () => marketing);

afterEach(() => {
  cleanup();
  marketing.notifyWhenBackInStock.mockReset();
});

const send = async (email: string) => {
  await userEvent.type(screen.getByLabelText("Email"), email);
  await userEvent.click(screen.getByRole("button", { name: "Notify me" }));
};

describe("NotifyMe", () => {
  it("offers marketing email only when there's a list for it", () => {
    render(
      <NotifyMe
        variantId="gid://shopify/ProductVariant/1"
        variantLabel={null}
      />,
    );
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByRole("link", { name: "Privacy policy" })).toBeNull();
  });

  it("marks the email field only for an error about the address", async () => {
    marketing.notifyWhenBackInStock.mockResolvedValueOnce({
      status: "error",
      message: "Enter a valid email address.",
      email: "avery@",
      field: "email",
    });
    render(
      <NotifyMe
        variantId="gid://shopify/ProductVariant/1"
        variantLabel={null}
      />,
    );
    await send("avery@example.test");
    const field = await screen.findByLabelText("Email");
    await screen.findByText("Enter a valid email address.");
    expect(field.getAttribute("aria-invalid")).toBe("true");
    expect(
      document.getElementById(field.getAttribute("aria-describedby")!)
        ?.textContent,
    ).toBe("Enter a valid email address.");
  });

  it("doesn't mark the field for an error that isn't about it", async () => {
    marketing.notifyWhenBackInStock.mockResolvedValueOnce({
      status: "error",
      message: "Something went wrong. Please try again.",
      email: "avery@example.test",
    });
    render(
      <NotifyMe
        variantId="gid://shopify/ProductVariant/1"
        variantLabel={null}
      />,
    );
    await send("avery@example.test");
    await screen.findByText("Something went wrong. Please try again.");
    const field = screen.getByLabelText("Email");
    expect(field.getAttribute("aria-invalid")).toBeNull();
    expect(field.getAttribute("aria-describedby")).toBeNull();
  });
});
