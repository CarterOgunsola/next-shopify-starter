import "server-only";
import { z } from "zod";
import { GIFT_CARD_KEYS, recipientErrors, serverSendWindow } from "./gift-card";

// Server check for line attributes from the browser: none, or a complete,
// valid set of gift card recipient details.
export const lineAttributesSchema = z
  .array(z.object({ key: z.string().max(100), value: z.string().max(1000) }))
  .max(6)
  .refine((attributes) => {
    if (attributes.length === 0) return true;
    const map = new Map(attributes.map((a) => [a.key, a.value]));
    const allowed = new Set<string>(Object.values(GIFT_CARD_KEYS));
    if ([...map.keys()].some((key) => !allowed.has(key))) return false;
    if (map.size !== attributes.length) return false;
    if (map.get(GIFT_CARD_KEYS.send) !== "on") return false;
    const offset = map.get(GIFT_CARD_KEYS.offset);
    if (offset !== undefined && !/^-?\d{1,3}$/.test(offset)) return false;
    const errors = recipientErrors(
      {
        email: map.get(GIFT_CARD_KEYS.email) ?? "",
        name: map.get(GIFT_CARD_KEYS.name) ?? "",
        message: map.get(GIFT_CARD_KEYS.message) ?? "",
        sendOn: map.get(GIFT_CARD_KEYS.sendOn) ?? "",
      },
      serverSendWindow(),
    );
    // The browser's check, then the server's stricter one (no dots at the
    // ends or doubled in the name part).
    return (
      Object.keys(errors).length === 0 &&
      z.email().safeParse(map.get(GIFT_CARD_KEYS.email)).success
    );
  });
