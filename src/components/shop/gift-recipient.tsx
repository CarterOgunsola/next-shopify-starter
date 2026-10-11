"use client";

import { useId } from "react";
import {
  GIFT_MESSAGE_MAX,
  type GiftRecipient,
  localSendWindow,
} from "@/lib/commerce/gift-card";

export type GiftState = { send: boolean; recipient: GiftRecipient };
export const NO_GIFT: GiftState = {
  send: false,
  recipient: { email: "", name: "", message: "", sendOn: "" },
};

// "Send as a gift": the recipient's email (required), name, a message and
// the day Shopify emails the card (today if left empty).
export function GiftRecipientFields({
  value,
  errors,
  onChange,
}: {
  value: GiftState;
  errors: Partial<Record<keyof GiftRecipient, string>>;
  onChange: (next: GiftState) => void;
}) {
  const id = useId();
  const set = (field: keyof GiftRecipient, text: string) =>
    onChange({ ...value, recipient: { ...value.recipient, [field]: text } });
  const describedBy = (field: keyof GiftRecipient, hint?: string) =>
    [hint, errors[field] && `${id}-${field}-error`].filter(Boolean).join(" ") ||
    undefined;
  const error = (field: keyof GiftRecipient) =>
    errors[field] && <span id={`${id}-${field}-error`}> {errors[field]}</span>;

  return (
    <fieldset>
      <legend>Gift card delivery</legend>
      <label>
        <input
          type="checkbox"
          checked={value.send}
          onChange={(event) =>
            onChange({ ...value, send: event.target.checked })
          }
        />{" "}
        Send it to someone by email
      </label>
      {!value.send && <p>Otherwise the card is emailed to you.</p>}
      {value.send && (
        <>
          <p>
            <label htmlFor={`${id}-email`}>Recipient email</label>{" "}
            <input
              id={`${id}-email`}
              type="email"
              autoComplete="off"
              required
              maxLength={254}
              value={value.recipient.email}
              onChange={(event) => set("email", event.target.value)}
              aria-invalid={errors.email ? true : undefined}
              aria-describedby={describedBy("email")}
            />
            {error("email")}
          </p>
          <p>
            <label htmlFor={`${id}-name`}>Recipient name (optional)</label>{" "}
            <input
              id={`${id}-name`}
              autoComplete="off"
              maxLength={100}
              value={value.recipient.name}
              onChange={(event) => set("name", event.target.value)}
              aria-invalid={errors.name ? true : undefined}
              aria-describedby={describedBy("name")}
            />
            {error("name")}
          </p>
          <p>
            <label htmlFor={`${id}-message`}>Message (optional)</label>{" "}
            <textarea
              id={`${id}-message`}
              rows={3}
              maxLength={GIFT_MESSAGE_MAX}
              value={value.recipient.message}
              onChange={(event) => set("message", event.target.value)}
              aria-invalid={errors.message ? true : undefined}
              aria-describedby={describedBy("message", `${id}-message-count`)}
            />
            <span id={`${id}-message-count`}>
              {" "}
              {GIFT_MESSAGE_MAX - value.recipient.message.length} characters
              left
            </span>
            {error("message")}
          </p>
          <p>
            <label htmlFor={`${id}-send-on`}>Send on (optional)</label>{" "}
            <input
              id={`${id}-send-on`}
              type="date"
              min={localSendWindow().earliest}
              max={localSendWindow().latest}
              value={value.recipient.sendOn}
              onChange={(event) => set("sendOn", event.target.value)}
              aria-invalid={errors.sendOn ? true : undefined}
              aria-describedby={describedBy("sendOn", `${id}-send-on-hint`)}
            />
            <span id={`${id}-send-on-hint`}>
              {" "}
              Leave empty to send it as soon as the order is placed.
            </span>
            {error("sendOn")}
          </p>
        </>
      )}
    </fieldset>
  );
}
