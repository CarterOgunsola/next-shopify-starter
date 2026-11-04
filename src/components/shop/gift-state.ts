import type { GiftRecipient } from "@/lib/commerce/gift-card";

export type GiftState = { send: boolean; recipient: GiftRecipient };
export const NO_GIFT: GiftState = {
  send: false,
  recipient: { email: "", name: "", message: "", sendOn: "" },
};
