// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SignOutForm } from "./sign-out-form";

afterEach(cleanup);

describe("SignOutForm", () => {
  it("posts to sign out and forgets recently viewed products", () => {
    window.localStorage.setItem("recently-viewed", '["a"]');
    const { container } = render(<SignOutForm />);
    const form = container.querySelector("form")!;
    expect(form.getAttribute("action")).toBe("/account/logout");
    form.addEventListener("submit", (event) => event.preventDefault());
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(window.localStorage.getItem("recently-viewed")).toBeNull();
  });
});
