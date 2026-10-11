"use client";

import { type RefObject, useEffect } from "react";
import type { AccountActionResult } from "@/lib/commerce";

export const hasFieldErrors = (result: AccountActionResult) =>
  !result.ok && Object.keys(result.fieldErrors ?? {}).length > 0;

// After a failed save with marked fields: focus the first one, so the
// customer lands where the fix is needed (its error is its description).
export function useFocusFirstInvalid(
  form: RefObject<HTMLFormElement | null>,
  result: AccountActionResult | null,
) {
  useEffect(() => {
    if (result && hasFieldErrors(result)) {
      form.current
        ?.querySelector<HTMLElement>('[aria-invalid="true"]')
        ?.focus();
    }
  }, [form, result]);
}
