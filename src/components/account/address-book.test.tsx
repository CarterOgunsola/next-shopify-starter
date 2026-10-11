// @vitest-environment jsdom
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CustomerAddress } from "@/lib/commerce";
import { ADDRESS_FIELDS } from "@/lib/commerce/account-messages";
import { AddressBook } from "./address-book";
import { ProfileForm } from "./profile-form";

const actions = vi.hoisted(() => ({
  saveAddress: vi.fn(),
  removeAddress: vi.fn(),
  makeDefaultAddress: vi.fn(),
  saveProfile: vi.fn(),
}));
vi.mock("@/lib/commerce/account.actions", () => actions);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const address = (
  id: string,
  line: string,
  isDefault: boolean,
): CustomerAddress => ({
  id: `gid://shopify/CustomerAddress/${id}`,
  firstName: "Avery",
  lastName: "Example",
  company: null,
  address1: line,
  address2: null,
  city: "Springfield",
  zoneCode: "IL",
  countryCode: "US",
  zip: "62701",
  phoneNumber: null,
  formatted: ["Avery Example", line, "Springfield IL 62701", "United States"],
  isDefault,
});
const book = [
  address("702", "100 Test Street", true),
  address("701", "200 Sample Road", false),
];

describe("AddressBook", () => {
  it("asks before deleting, then announces and focuses the outcome", async () => {
    actions.removeAddress.mockResolvedValue({
      ok: true,
      message: "Address deleted.",
    });
    render(<AddressBook addresses={book} />);
    await userEvent.click(
      screen.getByRole("button", { name: "Delete 200 Sample Road" }),
    );
    expect(actions.removeAddress).not.toHaveBeenCalled();
    await userEvent.click(
      screen.getByRole("button", { name: "Yes, delete 200 Sample Road" }),
    );
    expect(actions.removeAddress).toHaveBeenCalledWith(
      "gid://shopify/CustomerAddress/701",
    );
    const status = await screen.findByText("Address deleted.");
    expect(status.getAttribute("role")).toBe("status");
    await waitFor(() => expect(document.activeElement).toBe(status));
  });

  it("shows a refused change as an alert", async () => {
    actions.makeDefaultAddress.mockResolvedValue({
      ok: false,
      error: "That didn't save. Try again.",
    });
    render(<AddressBook addresses={book} />);
    await userEvent.click(
      screen.getByRole("button", { name: "Make 200 Sample Road the default" }),
    );
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "That didn't save. Try again.",
    );
  });

  it("marks fields Shopify or validation rejected", async () => {
    actions.saveAddress.mockResolvedValue({
      ok: false,
      error: "Check the highlighted fields.",
      fieldErrors: { address1: "Enter the street address." },
    });
    render(<AddressBook addresses={[]} />);
    const street = screen.getByLabelText("Street address");
    await userEvent.type(street, "PO");
    await userEvent.type(screen.getByLabelText("City"), "Springfield");
    await userEvent.selectOptions(screen.getByLabelText("State"), "IL");
    await userEvent.click(screen.getByRole("button", { name: "Add address" }));
    // The fields are rebuilt after a save: look the field up again.
    await waitFor(() =>
      expect(
        screen.getByLabelText("Street address").getAttribute("aria-invalid"),
      ).toBe("true"),
    );
    expect(screen.getByText("Enter the street address.")).toBeTruthy();
  });
});

describe("after a failed save", () => {
  it("keeps what the customer typed in the address form", async () => {
    actions.saveAddress.mockImplementation(async (_prev, form: FormData) => ({
      ok: false,
      error: "Check the highlighted fields.",
      fieldErrors: { zip: "Enter a valid ZIP." },
      values: Object.fromEntries(
        [...form.entries()].map(([k, v]) => [k, String(v)]),
      ),
    }));
    render(<AddressBook addresses={[]} />);
    await userEvent.type(screen.getByLabelText("Street address"), "1 Test Way");
    await userEvent.type(screen.getByLabelText("City"), "Springfield");
    await userEvent.selectOptions(screen.getByLabelText("State"), "IL");
    await userEvent.type(screen.getByLabelText("ZIP or postal code"), "ABC");
    await userEvent.click(screen.getByRole("button", { name: "Add address" }));
    const zipField = () => screen.getByLabelText("ZIP or postal code");
    await waitFor(() =>
      expect(zipField().getAttribute("aria-invalid")).toBe("true"),
    );
    const zip = zipField();
    expect(zip).toHaveProperty("value", "ABC");
    // Focus lands on the field to fix.
    await waitFor(() => expect(document.activeElement).toBe(zip));
    expect(screen.getByLabelText("Street address")).toHaveProperty(
      "value",
      "1 Test Way",
    );
    expect(screen.getByLabelText("City")).toHaveProperty(
      "value",
      "Springfield",
    );
  });

  it("keeps the chosen country and province in a new address", async () => {
    actions.saveAddress.mockImplementation(async (_prev, form: FormData) => ({
      ok: false,
      error: "Check the highlighted fields.",
      fieldErrors: { zip: "Enter a valid postal code." },
      values: Object.fromEntries(
        [...form.entries()].map(([k, v]) => [k, String(v)]),
      ),
    }));
    render(<AddressBook addresses={[]} />);
    await userEvent.type(screen.getByLabelText("Street address"), "1 Test Way");
    await userEvent.type(screen.getByLabelText("City"), "Toronto");
    await userEvent.selectOptions(screen.getByLabelText("Country"), "CA");
    await userEvent.selectOptions(
      screen.getByLabelText("Province or territory"),
      "ON",
    );
    await userEvent.click(screen.getByRole("button", { name: "Add address" }));
    await waitFor(() =>
      expect(
        screen
          .getByLabelText("ZIP or postal code")
          .getAttribute("aria-invalid"),
      ).toBe("true"),
    );
    expect(screen.getByLabelText("Country")).toHaveProperty("value", "CA");
    expect(screen.getByLabelText("Province or territory")).toHaveProperty(
      "value",
      "ON",
    );
    expect(screen.getByLabelText("City")).toHaveProperty("value", "Toronto");
  });

  it("keeps the newly chosen country and province when editing", async () => {
    actions.saveAddress.mockImplementation(async (_prev, form: FormData) => ({
      ok: false,
      error: "Check the highlighted fields.",
      fieldErrors: { zip: "Enter a valid postal code." },
      values: Object.fromEntries(
        [...form.entries()].map(([k, v]) => [k, String(v)]),
      ),
    }));
    render(<AddressBook addresses={[book[0]]} />);
    await userEvent.click(
      screen.getByRole("button", { name: "Edit 100 Test Street" }),
    );
    const form = screen.getByRole("form", { name: "Edit 100 Test Street" });
    await userEvent.selectOptions(within(form).getByLabelText("Country"), "CA");
    await userEvent.selectOptions(
      within(form).getByLabelText("Province or territory"),
      "BC",
    );
    await userEvent.click(
      within(form).getByRole("button", { name: "Save address" }),
    );
    await waitFor(() =>
      expect(
        within(form)
          .getByLabelText("ZIP or postal code")
          .getAttribute("aria-invalid"),
      ).toBe("true"),
    );
    expect(within(form).getByLabelText("Country")).toHaveProperty(
      "value",
      "CA",
    );
    expect(within(form).getByLabelText("Province or territory")).toHaveProperty(
      "value",
      "BC",
    );
  });

  it("keeps what the customer typed in the profile form", async () => {
    actions.saveProfile.mockImplementation(async (_prev, form: FormData) => ({
      ok: false,
      error: "Check the highlighted fields.",
      fieldErrors: { lastName: "Names can't contain web addresses." },
      values: {
        firstName: String(form.get("firstName")),
        lastName: String(form.get("lastName")),
      },
    }));
    render(
      <ProfileForm
        profile={{ firstName: "Avery", lastName: "Example", email: null }}
        manageUrl=""
      />,
    );
    const last = screen.getByLabelText("Last name");
    await userEvent.clear(last);
    await userEvent.type(last, "example.test");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(last.getAttribute("aria-invalid")).toBe("true"));
    expect(last).toHaveProperty("value", "example.test");
  });
});

describe("the address form's fields", () => {
  it("are the ones errors can be shown on", () => {
    const { container } = render(<AddressBook addresses={[]} />);
    const form = container.querySelector('form[aria-label="New address"]')!;
    for (const name of ADDRESS_FIELDS) {
      expect(form.querySelector(`[name="${name}"]`), name).not.toBeNull();
    }
    // And every field the customer fills in is one of them.
    const rendered = [...form.querySelectorAll("input, select, textarea")]
      .filter((el) => (el as HTMLInputElement).type !== "hidden")
      .map((el) => el.getAttribute("name"))
      .filter((name) => name !== "default");
    expect(rendered.sort()).toEqual([...ADDRESS_FIELDS].sort());
  });
});

describe("ProfileForm", () => {
  it("shows email read-only with where to change it, and announces a save", async () => {
    actions.saveProfile.mockResolvedValue({
      ok: true,
      message: "Your name was saved.",
    });
    render(
      <ProfileForm
        profile={{
          firstName: "Avery",
          lastName: "Example",
          email: "avery@example.test",
        }}
        manageUrl="https://shopify.com/7/account"
      />,
    );
    expect(screen.queryByRole("textbox", { name: /email/i })).toBeNull();
    expect(
      screen
        .getByRole("link", { name: "your Shopify account" })
        .getAttribute("href"),
    ).toBe("https://shopify.com/7/account");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    const status = await screen.findByText("Your name was saved.");
    await waitFor(() => expect(document.activeElement).toBe(status));
  });
});

describe("focus as buttons swap", () => {
  it("moves to the confirm button, then back to Delete on Keep it", async () => {
    render(<AddressBook addresses={book} />);
    await userEvent.click(
      screen.getByRole("button", { name: "Delete 200 Sample Road" }),
    );
    const confirm = screen.getByRole("button", {
      name: "Yes, delete 200 Sample Road",
    });
    await waitFor(() => expect(document.activeElement).toBe(confirm));
    await userEvent.click(
      screen.getByRole("button", { name: "Keep 200 Sample Road" }),
    );
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: "Delete 200 Sample Road" }),
      ),
    );
  });

  it("moves into the edit form, then back to Edit on Cancel", async () => {
    render(<AddressBook addresses={book} />);
    await userEvent.click(
      screen.getByRole("button", { name: "Edit 100 Test Street" }),
    );
    const form = screen.getByRole("form", { name: "Edit 100 Test Street" });
    await waitFor(() =>
      expect(document.activeElement).toBe(
        within(form).getByLabelText("First name"),
      ),
    );
    await userEvent.click(within(form).getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: "Edit 100 Test Street" }),
      ),
    );
  });
});

describe("a session that ended", () => {
  it("offers to sign in again, coming back to the page", async () => {
    actions.saveProfile.mockResolvedValue({
      ok: false,
      error: "Your session ended. Sign in again to make changes.",
      signIn: "/account/login?return_to=%2Faccount%2Fprofile",
    });
    render(
      <ProfileForm
        profile={{ firstName: "Avery", lastName: "Example", email: null }}
        manageUrl=""
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    const alert = await screen.findByRole("alert");
    expect(
      within(alert).getByRole("link", { name: "Sign in" }).getAttribute("href"),
    ).toBe("/account/login?return_to=%2Faccount%2Fprofile");
  });
});

describe("the country field", () => {
  it("is described by its error", async () => {
    actions.saveAddress.mockResolvedValue({
      ok: false,
      error: "Check the highlighted fields.",
      fieldErrors: { countryCode: "Choose a country from the list." },
    });
    render(<AddressBook addresses={[]} />);
    await userEvent.type(screen.getByLabelText("Street address"), "1 Test Way");
    await userEvent.type(screen.getByLabelText("City"), "Springfield");
    await userEvent.selectOptions(screen.getByLabelText("State"), "IL");
    await userEvent.click(screen.getByRole("button", { name: "Add address" }));
    await waitFor(() =>
      expect(
        screen.getByLabelText("Country").getAttribute("aria-invalid"),
      ).toBe("true"),
    );
    const country = screen.getByLabelText("Country");
    const described = document.getElementById(
      country.getAttribute("aria-describedby")!,
    );
    expect(described?.textContent?.trim()).toBe(
      "Choose a country from the list.",
    );
    await waitFor(() => expect(document.activeElement).toBe(country));
  });
});

describe("the state or province", () => {
  it("is chosen from the country's own list", async () => {
    render(<AddressBook addresses={[]} />);
    const state = screen.getByLabelText("State");
    expect(
      within(state).getByRole("option", { name: "Illinois" }),
    ).toBeTruthy();
    await userEvent.selectOptions(screen.getByLabelText("Country"), "CA");
    const province = screen.getByLabelText("Province or territory");
    expect(
      within(province).getByRole("option", { name: "Ontario" }),
    ).toBeTruthy();
    expect(
      within(province).queryByRole("option", { name: "Illinois" }),
    ).toBeNull();
  });

  it("starts at the saved address's state", () => {
    render(<AddressBook addresses={[book[0]]} />);
    return userEvent
      .click(screen.getByRole("button", { name: "Edit 100 Test Street" }))
      .then(() => {
        const form = screen.getByRole("form", { name: "Edit 100 Test Street" });
        expect(within(form).getByLabelText("State")).toHaveProperty(
          "value",
          "IL",
        );
      });
  });
});
