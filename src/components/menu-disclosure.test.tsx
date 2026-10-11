// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import type { MenuItem } from "@/lib/commerce";
import { MenuDisclosure } from "./menu-disclosure";

afterEach(cleanup);

const item: MenuItem = {
  title: "Shop",
  url: "/shop",
  items: [
    {
      title: "Apparel",
      url: "/collections/test-apparel",
      items: [{ title: "Tee", url: "/products/tee", items: [] }],
    },
    {
      title: "Status",
      url: "https://status.example.com/",
      external: true,
      items: [],
    },
  ],
};

describe("MenuDisclosure", () => {
  it("opens and closes from the keyboard, Escape returning to the button", async () => {
    render(
      <>
        <MenuDisclosure item={item} />
        <a href="/elsewhere">Elsewhere</a>
      </>,
    );
    const button = screen.getByRole("button", { name: "Shop" });
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("link", { name: "Apparel" })).toBeNull();

    button.focus();
    await userEvent.keyboard("{Enter}");
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(
      screen.getByRole("link", { name: "All Shop" }).getAttribute("href"),
    ).toBe("/shop");
    expect(screen.getByRole("list", { name: "Apparel" }).textContent).toBe(
      "Tee",
    );
    expect(
      screen.getByRole("link", { name: "Status" }).getAttribute("rel"),
    ).toBe("noopener");

    await userEvent.tab();
    expect(document.activeElement?.textContent).toBe("All Shop");
    await userEvent.keyboard("{Escape}");
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(button);

    // Space opens; tabbing out of it closes it.
    await userEvent.keyboard(" ");
    expect(button.getAttribute("aria-expanded")).toBe("true");
    for (let i = 0; i < 5; i++) await userEvent.tab();
    expect(document.activeElement?.textContent).toBe("Elsewhere");
    expect(button.getAttribute("aria-expanded")).toBe("false");
  });

  it("stays open for a click inside that doesn't move focus (Safari, text)", async () => {
    render(
      <>
        <MenuDisclosure item={item} />
        <p>Outside</p>
      </>,
    );
    const button = screen.getByRole("button", { name: "Shop" });
    // Opened from the keyboard, then a click on a link inside, which Safari
    // doesn't focus: the blur has no related target.
    button.focus();
    await userEvent.keyboard("{Enter}");
    fireEvent.blur(button, { relatedTarget: null });
    expect(button.getAttribute("aria-expanded")).toBe("true");
    // A click on the list's text (a group heading) keeps it open too.
    await userEvent.click(screen.getByRole("list", { name: "Apparel" }));
    expect(button.getAttribute("aria-expanded")).toBe("true");
    // A click outside closes it.
    await userEvent.click(screen.getByText("Outside"));
    expect(button.getAttribute("aria-expanded")).toBe("false");
  });
});
