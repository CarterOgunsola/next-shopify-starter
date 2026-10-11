// Gift card recipient details, sent with the cart line as the line
// attributes Shopify reads for gift cards (the same keys its themes use):
// Shopify emails the card to the recipient, on the chosen day.
export const GIFT_CARD_KEYS = {
  send: "__shopify_send_gift_card_to_recipient",
  email: "Recipient email",
  name: "Recipient name",
  message: "Message",
  sendOn: "Send on",
  // The buyer's Date.getTimezoneOffset() (minutes behind UTC: 300 in New
  // York in winter), as Shopify's themes send it, for Send on.
  offset: "__shopify_offset",
} as const;

export const GIFT_MESSAGE_MAX = 200;
export const SEND_WITHIN_DAYS = 90;

export type GiftRecipient = {
  email: string;
  name: string;
  message: string;
  // YYYY-MM-DD, or "" to send at once.
  sendOn: string;
};

// The attributes for a gift card line sent to someone. timezoneOffset:
// new Date().getTimezoneOffset() when the buyer adds it, unchanged.
export function giftCardAttributes(
  recipient: GiftRecipient,
  timezoneOffset: number,
): { key: string; value: string }[] {
  return [
    { key: GIFT_CARD_KEYS.send, value: "on" },
    { key: GIFT_CARD_KEYS.email, value: recipient.email.trim() },
    ...(recipient.name.trim()
      ? [{ key: GIFT_CARD_KEYS.name, value: recipient.name.trim() }]
      : []),
    ...(recipient.message.trim()
      ? [{ key: GIFT_CARD_KEYS.message, value: recipient.message.trim() }]
      : []),
    ...(recipient.sendOn
      ? [
          { key: GIFT_CARD_KEYS.sendOn, value: recipient.sendOn },
          { key: GIFT_CARD_KEYS.offset, value: String(timezoneOffset) },
        ]
      : []),
  ];
}

const noTags = (value: string) => !/[<>]/.test(value);
// An email address as browsers check one (type="email"), with a dot in the
// domain. Kept free of a validation library: this runs in the browser.
const EMAIL =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
const pad = (n: number) => String(n).padStart(2, "0");

// Which Send on days are allowed, as YYYY-MM-DD.
type SendWindow = { earliest: string; latest: string };

// In the browser: today to 90 days on, by the buyer's own calendar (what
// the date picker shows).
export function localSendWindow(today = new Date()): SendWindow {
  const local = (date: Date) =>
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const latest = new Date(today);
  latest.setDate(latest.getDate() + SEND_WITHIN_DAYS);
  return { earliest: local(today), latest: local(latest) };
}

// On the server, which doesn't know the buyer's calendar: a day either side
// of the browser's window, in UTC.
export function serverSendWindow(today = new Date()): SendWindow {
  const utc = (days: number) => {
    const date = new Date(today);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  };
  return { earliest: utc(-1), latest: utc(SEND_WITHIN_DAYS + 1) };
}

// Problems with recipient details, keyed by field, in our words.
export function recipientErrors(
  recipient: GiftRecipient,
  window: SendWindow = localSendWindow(),
): Partial<Record<keyof GiftRecipient, string>> {
  const errors: Partial<Record<keyof GiftRecipient, string>> = {};
  const email = recipient.email.trim();
  if (email.length > 254 || !EMAIL.test(email)) {
    errors.email = "Enter the recipient's email address.";
  }
  if (recipient.name.length > 100 || !noTags(recipient.name)) {
    errors.name = "Use up to 100 characters, without < or >.";
  }
  if (
    recipient.message.length > GIFT_MESSAGE_MAX ||
    !noTags(recipient.message)
  ) {
    errors.message = `Use up to ${GIFT_MESSAGE_MAX} characters, without < or >.`;
  }
  if (recipient.sendOn) {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(recipient.sendOn) ||
      recipient.sendOn < window.earliest ||
      recipient.sendOn > window.latest
    ) {
      errors.sendOn = `Choose a day between today and ${SEND_WITHIN_DAYS} days from now.`;
    }
  }
  return errors;
}
