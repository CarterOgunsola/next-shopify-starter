// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ConsentModel } from "@/lib/consent/types";
import { PrivacyChoices } from "./privacy-choices";

const consent = vi.hoisted(() => ({ model: "optOut" as ConsentModel }));
vi.mock("@/lib/consent/client", () => ({
  useConsent: () => ({
    ready: true,
    model: consent.model,
    state: { saleOfData: true, gpc: false, decided: false },
    setSaleOptOut: vi.fn(),
    openPreferences: vi.fn(),
  }),
}));

afterEach(cleanup);

describe("PrivacyChoices", () => {
  it("offers the Do Not Sell or Share toggle under the opt-out model", () => {
    consent.model = "optOut";
    render(<PrivacyChoices />);
    expect(
      screen.getByRole("checkbox", {
        name: "Do not sell or share my personal information",
      }),
    ).toBeTruthy();
  });

  it("offers only cookie settings where marketing needs opt-in", () => {
    consent.model = "optIn";
    render(<PrivacyChoices />);
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Manage cookie settings" }),
    ).toBeTruthy();
  });
});
