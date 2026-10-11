import { describe, expect, it } from "vitest";
import { describeUserErrors } from "./account-messages";

const error = (code: string, field: string[] | null) => ({
  code,
  field,
  message: "Shopify's own words",
});

describe("describeUserErrors", () => {
  it("marks the form's own fields, in our words", () => {
    expect(
      describeUserErrors(
        [error("ADDRESS1_MISSING", ["address", "address1"])],
        "address",
      ),
    ).toEqual({
      error: "Check the highlighted fields.",
      fieldErrors: { address1: "Enter the street address." },
    });
  });

  it("marks the phone field", () => {
    expect(
      describeUserErrors(
        [error("PHONE_NUMBER_NOT_VALID", ["address", "phoneNumber"])],
        "address",
      ).fieldErrors,
    ).toEqual({ phoneNumber: "Enter a valid phone number." });
  });

  it("puts Shopify's territoryCode on our country field", () => {
    expect(
      describeUserErrors(
        [error("INVALID_TERRITORY_CODE", ["address", "territoryCode"])],
        "address",
      ).fieldErrors,
    ).toEqual({ countryCode: "Choose a country from the list." });
  });

  it.each([
    [
      ["addressId"],
      "ADDRESS_ID_DOES_NOT_EXIST",
      "That address no longer exists.",
    ],
    [
      ["address", "provinceCode"],
      "INVALID_FOR_COUNTRY",
      "This doesn't match the country.",
    ],
    [
      null,
      "CUSTOMER_ADDRESS_ALREADY_EXISTS",
      "You already saved this address.",
    ],
  ])(
    "gives an error on a field the form doesn't show (%j) as the general message",
    (field, code, words) => {
      expect(describeUserErrors([error(code, field)], "address")).toEqual({
        error: words,
        fieldErrors: {},
      });
    },
  );

  it("never shows Shopify's own message", () => {
    expect(
      JSON.stringify(
        describeUserErrors([error("SOMETHING_NEW", ["x"])], "profile"),
      ),
    ).not.toContain("Shopify's own words");
  });
});
