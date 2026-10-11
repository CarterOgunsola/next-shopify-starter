import "server-only";
import { z } from "zod";
import { serverEnv } from "@/lib/env";
import { klaviyoBackInStock, klaviyoSubscribeEmail } from "./klaviyo";
import type { BackInStockState } from "./back-in-stock-shared";
import { HONEYPOT_FIELD } from "./newsletter-shared";

const emailSchema = z.email().max(254);

// Alerts are set up (the Klaviyo private key is set).
export function backInStockEnabled(): boolean {
  return Boolean(serverEnv().KLAVIYO_PRIVATE_API_KEY);
}

// The form's marketing opt-in: only with a list to subscribe to.
export function backInStockMarketing(): boolean {
  const env = serverEnv();
  return Boolean(env.KLAVIYO_PRIVATE_API_KEY && env.KLAVIYO_LIST_ID);
}
const variantGid = /^gid:\/\/shopify\/ProductVariant\/(\d{1,20})$/;

export type BackInStockDeps = {
  apiKey: string | undefined;
  // For the separate, optional marketing opt-in.
  listId: string | undefined;
  allow: (key: string) => boolean;
  clientKey: string;
  alert?: typeof klaviyoBackInStock;
  subscribe?: typeof klaviyoSubscribeEmail;
  log?: (message: string) => void;
};

const SUCCESS = "We'll email you when it's back in stock.";

// "Notify me" on a sold-out variant: one back-in-stock email from Klaviyo.
// That's a transactional alert; marketing email only if the visitor also
// ticks the separate opt-in. Logs never include the email address.
export async function handleBackInStock(
  form: FormData,
  {
    apiKey,
    listId,
    allow,
    clientKey,
    alert = klaviyoBackInStock,
    subscribe = klaviyoSubscribeEmail,
    log = console.warn,
  }: BackInStockDeps,
): Promise<BackInStockState> {
  const email = String(form.get("email") ?? "").trim();
  // Bots fill every field. Pretend it worked and do nothing.
  if (form.get(HONEYPOT_FIELD)) return { status: "success", message: SUCCESS };

  const variant = variantGid.exec(String(form.get("variantId") ?? ""))?.[1];
  if (!variant) {
    return { status: "error", message: "Choose an option first.", email };
  }
  const parsed = emailSchema.safeParse(email);
  if (!parsed.success) {
    return {
      status: "error",
      message: "Enter a valid email address.",
      email,
      field: "email",
    };
  }
  if (!allow(clientKey)) {
    return {
      status: "error",
      message: "Too many attempts. Try again in a few minutes.",
      email,
    };
  }
  if (!apiKey) {
    log("[back-in-stock] Klaviyo is not configured; alert skipped.");
    return {
      status: "error",
      message: "Alerts aren't available yet. Check back soon.",
      email,
    };
  }
  try {
    const result = await alert({
      apiKey,
      email: parsed.data,
      variantId: variant,
    });
    if (!result.ok) {
      log(`[back-in-stock] Klaviyo returned ${result.status}.`);
      return {
        status: "error",
        message: "Something went wrong. Please try again.",
        email,
      };
    }
  } catch (error) {
    log(`[back-in-stock] Klaviyo request failed: ${(error as Error).name}.`);
    return {
      status: "error",
      message: "Something went wrong. Please try again.",
      email,
    };
  }
  // The marketing opt-in is separate and optional; the alert stands either
  // way.
  if (form.get("marketing") === "on" && listId) {
    try {
      const subscribed = await subscribe({
        apiKey,
        listId,
        email: parsed.data,
        source: "back in stock",
      });
      if (!subscribed.ok) {
        log(`[back-in-stock] opt-in: Klaviyo returned ${subscribed.status}.`);
      }
    } catch (error) {
      log(`[back-in-stock] opt-in failed: ${(error as Error).name}.`);
    }
  }
  return { status: "success", message: SUCCESS };
}
