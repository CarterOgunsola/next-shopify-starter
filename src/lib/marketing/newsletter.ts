import { BRAND } from "@/lib/brand";
import "server-only";
import { z } from "zod";
import { klaviyoSubscribeEmail } from "./klaviyo";
import { HONEYPOT_FIELD, type SignupState } from "./newsletter-shared";

const emailSchema = z.email().max(254);

export type SignupDeps = {
  apiKey: string | undefined;
  listId: string | undefined;
  allow: (key: string) => boolean;
  clientKey: string;
  subscribe?: typeof klaviyoSubscribeEmail;
  log?: (message: string) => void;
};

// Logs never include the email address.
export async function handleSignup(
  form: FormData,
  {
    apiKey,
    listId,
    allow,
    clientKey,
    subscribe = klaviyoSubscribeEmail,
    log = console.warn,
  }: SignupDeps,
): Promise<SignupState> {
  // Bots fill every field. Pretend it worked and do nothing.
  if (form.get(HONEYPOT_FIELD)) return { status: "success" };

  const parsed = emailSchema.safeParse(String(form.get("email") ?? "").trim());
  if (!parsed.success) {
    return { status: "error", message: "Enter a valid email address." };
  }

  if (!allow(clientKey)) {
    return {
      status: "error",
      message: "Too many attempts. Try again in a few minutes.",
    };
  }

  if (!apiKey || !listId) {
    log("[newsletter] Klaviyo is not configured; sign-up skipped.");
    return {
      status: "error",
      message: "Sign-up isn't available yet. Check back soon.",
    };
  }

  const source = String(form.get("source") ?? "site").slice(0, 50);
  try {
    const result = await subscribe({
      apiKey,
      listId,
      email: parsed.data,
      source: `${BRAND.sourcePrefix} ${source}`,
    });
    if (result.ok) return { status: "success" };
    log(`[newsletter] Klaviyo returned ${result.status}.`);
  } catch (error) {
    log(`[newsletter] Klaviyo request failed: ${(error as Error).name}.`);
  }
  return {
    status: "error",
    message: "Something went wrong. Please try again.",
  };
}
