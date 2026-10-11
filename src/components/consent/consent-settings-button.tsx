"use client";

import { useConsent } from "@/lib/consent/client";

export function ConsentSettingsButton() {
  const { openPreferences } = useConsent();
  return (
    <button type="button" onClick={openPreferences}>
      Cookie settings
    </button>
  );
}
