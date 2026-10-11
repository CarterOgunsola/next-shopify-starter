// Server-safe exports. React pieces (useConsent, ConsentGate,
// ConsentProvider) live in "@/lib/consent/client".

export { readGpc, gpcFromHeader } from "./gpc";
export { defaultConsent, modelForCountry, resolveConsent } from "./policy";
export type * from "./types";
