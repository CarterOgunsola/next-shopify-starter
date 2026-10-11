type GpcNavigator = { globalPrivacyControl?: boolean };

// navigator.globalPrivacyControl is true when the browser sends GPC.
// https://developer.mozilla.org/en-US/docs/Web/API/Navigator/globalPrivacyControl
export function readGpc(
  nav: GpcNavigator | undefined = typeof navigator === "undefined"
    ? undefined
    : (navigator as GpcNavigator),
): boolean {
  return nav?.globalPrivacyControl === true;
}

// Request header form of the same signal.
export function gpcFromHeader(value: string | null | undefined): boolean {
  return value?.trim() === "1";
}
