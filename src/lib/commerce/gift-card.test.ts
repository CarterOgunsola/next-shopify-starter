import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GIFT_CARD_KEYS,
  giftCardAttributes,
  localSendWindow,
  recipientErrors,
  serverSendWindow,
} from "./gift-card";
import { lineAttributesSchema } from "./gift-card.server";

afterEach(() => {
  vi.useRealTimers();
});

const today = new Date("2026-10-09T12:00:00Z");
const recipient = {
  email: "sam@example.test",
  name: "Sam",
  message: "Happy birthday!",
  sendOn: "2026-10-20",
};

describe("gift card recipient details", () => {
  it("become the line attributes Shopify reads for gift cards", () => {
    // New York in winter: getTimezoneOffset() is 300, sent as is.
    expect(giftCardAttributes(recipient, 300)).toEqual([
      { key: "__shopify_send_gift_card_to_recipient", value: "on" },
      { key: "Recipient email", value: "sam@example.test" },
      { key: "Recipient name", value: "Sam" },
      { key: "Message", value: "Happy birthday!" },
      { key: "Send on", value: "2026-10-20" },
      { key: "__shopify_offset", value: "300" },
    ]);
    // Only the email is required; no day means send at once.
    expect(
      giftCardAttributes(
        { email: "sam@example.test", name: "", message: "", sendOn: "" },
        0,
      ),
    ).toEqual([
      { key: GIFT_CARD_KEYS.send, value: "on" },
      { key: GIFT_CARD_KEYS.email, value: "sam@example.test" },
    ]);
  });

  it("are checked in our words", () => {
    expect(recipientErrors(recipient, localSendWindow(today))).toEqual({});
    expect(
      recipientErrors(
        {
          email: "sam",
          name: "<b>",
          message: "x".repeat(201),
          sendOn: "2027-03-01",
        },
        localSendWindow(today),
      ),
    ).toEqual({
      email: "Enter the recipient's email address.",
      name: "Use up to 100 characters, without < or >.",
      message: "Use up to 200 characters, without < or >.",
      sendOn: "Choose a day between today and 90 days from now.",
    });
    expect(
      recipientErrors(
        { ...recipient, sendOn: "2026-10-01" },
        localSendWindow(today),
      ).sendOn,
    ).toBeTruthy();
  });

  it("allow Send on days by the buyer's calendar in the browser", () => {
    // 23:30 on 9 October where the buyer is, whatever the UTC date.
    expect(localSendWindow(new Date(2026, 9, 9, 23, 30))).toEqual({
      earliest: "2026-10-09",
      latest: "2027-01-07",
    });
  });

  it("allow a day either side on the server, which only knows UTC", () => {
    expect(serverSendWindow(today)).toEqual({
      earliest: "2026-10-08",
      latest: "2027-01-08",
    });
    vi.useFakeTimers({ toFake: ["Date"], now: today });
    const sendOn = (day: string) =>
      lineAttributesSchema.safeParse(
        giftCardAttributes({ ...recipient, sendOn: day }, 300),
      ).success;
    expect(sendOn("2026-10-08")).toBe(true);
    expect(sendOn("2027-01-08")).toBe(true);
    // Outside the window: refused, not dropped.
    expect(sendOn("2026-10-07")).toBe(false);
    expect(sendOn("2027-01-09")).toBe(false);
  });

  it("are the only line attributes the server accepts, complete and valid", () => {
    vi.useFakeTimers({ toFake: ["Date"], now: today });
    expect(lineAttributesSchema.safeParse([]).success).toBe(true);
    expect(
      lineAttributesSchema.safeParse(giftCardAttributes(recipient, 0)).success,
    ).toBe(true);
    for (const bad of [
      [{ key: "Engraving", value: "hi" }],
      [{ key: GIFT_CARD_KEYS.email, value: "sam@example.test" }],
      giftCardAttributes({ ...recipient, email: "nope" }, 0),
      // Passes the browser's check, not the server's.
      giftCardAttributes({ ...recipient, email: "sam..x@example.test" }, 0),
      [
        ...giftCardAttributes(recipient, 0),
        { key: "__shopify_offset", value: "abc" },
      ],
    ]) {
      expect(
        lineAttributesSchema.safeParse(bad).success,
        JSON.stringify(bad),
      ).toBe(false);
    }
  });
});
