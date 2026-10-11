"use server";

import { headers } from "next/headers";
import { clientIp } from "@/lib/host/client-ip";
import { serverEnv } from "@/lib/env";
import { createRateLimiter } from "@/lib/rate-limit";
import { handleBackInStock } from "./back-in-stock";
import type { BackInStockState } from "./back-in-stock-shared";
import { handleSignup } from "./newsletter";
import type { SignupState } from "./newsletter-shared";

const allow = createRateLimiter({ limit: 5, windowMs: 10 * 60 * 1000 });

export async function subscribeToNewsletter(
  _previous: SignupState,
  form: FormData,
): Promise<SignupState> {
  // Without a trusted IP every visitor would share one bucket and one bot
  // could lock everyone out, so production refuses instead. Locally there's
  // one visitor.
  const ip = clientIp(await headers());
  if (!ip && process.env.NODE_ENV === "production") {
    return {
      status: "error",
      message: "Sign-up isn't available right now. Please try again later.",
    };
  }

  return handleSignup(form, {
    apiKey: serverEnv().KLAVIYO_PRIVATE_API_KEY,
    listId: serverEnv().KLAVIYO_LIST_ID,
    allow,
    clientKey: ip ?? "local",
  });
}

const allowAlert = createRateLimiter({ limit: 5, windowMs: 10 * 60 * 1000 });

export async function notifyWhenBackInStock(
  _previous: BackInStockState,
  form: FormData,
): Promise<BackInStockState> {
  const ip = clientIp(await headers());
  if (!ip && process.env.NODE_ENV === "production") {
    return {
      status: "error",
      message: "Alerts aren't available right now. Please try again later.",
    };
  }
  return handleBackInStock(form, {
    apiKey: serverEnv().KLAVIYO_PRIVATE_API_KEY,
    listId: serverEnv().KLAVIYO_LIST_ID,
    allow: allowAlert,
    clientKey: ip ?? "local",
  });
}
