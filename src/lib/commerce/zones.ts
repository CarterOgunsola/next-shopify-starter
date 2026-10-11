// The countries the address book offers, with their states, provinces and
// territories as Shopify codes them (ISO 3166-2 subdivision suffixes).
// Shipping is US and Canada only, so these are the only two.

export const COUNTRIES = [
  ["US", "United States"],
  ["CA", "Canada"],
] as const;

export type CountryCode = (typeof COUNTRIES)[number][0];

export const ZONES: Record<
  CountryCode,
  { label: string; zones: [string, string][] }
> = {
  US: {
    label: "State",
    zones: [
      ["AL", "Alabama"],
      ["AK", "Alaska"],
      ["AS", "American Samoa"],
      ["AZ", "Arizona"],
      ["AR", "Arkansas"],
      ["AA", "Armed Forces Americas"],
      ["AE", "Armed Forces Europe"],
      ["AP", "Armed Forces Pacific"],
      ["CA", "California"],
      ["CO", "Colorado"],
      ["CT", "Connecticut"],
      ["DE", "Delaware"],
      ["DC", "District of Columbia"],
      ["FL", "Florida"],
      ["GA", "Georgia"],
      ["GU", "Guam"],
      ["HI", "Hawaii"],
      ["ID", "Idaho"],
      ["IL", "Illinois"],
      ["IN", "Indiana"],
      ["IA", "Iowa"],
      ["KS", "Kansas"],
      ["KY", "Kentucky"],
      ["LA", "Louisiana"],
      ["ME", "Maine"],
      ["MD", "Maryland"],
      ["MA", "Massachusetts"],
      ["MI", "Michigan"],
      ["MN", "Minnesota"],
      ["MS", "Mississippi"],
      ["MO", "Missouri"],
      ["MT", "Montana"],
      ["NE", "Nebraska"],
      ["NV", "Nevada"],
      ["NH", "New Hampshire"],
      ["NJ", "New Jersey"],
      ["NM", "New Mexico"],
      ["NY", "New York"],
      ["NC", "North Carolina"],
      ["ND", "North Dakota"],
      ["MP", "Northern Mariana Islands"],
      ["OH", "Ohio"],
      ["OK", "Oklahoma"],
      ["OR", "Oregon"],
      ["PA", "Pennsylvania"],
      ["PR", "Puerto Rico"],
      ["RI", "Rhode Island"],
      ["SC", "South Carolina"],
      ["SD", "South Dakota"],
      ["TN", "Tennessee"],
      ["TX", "Texas"],
      ["UM", "U.S. Outlying Islands"],
      ["VI", "U.S. Virgin Islands"],
      ["UT", "Utah"],
      ["VT", "Vermont"],
      ["VA", "Virginia"],
      ["WA", "Washington"],
      ["WV", "West Virginia"],
      ["WI", "Wisconsin"],
      ["WY", "Wyoming"],
    ],
  },
  CA: {
    label: "Province or territory",
    zones: [
      ["AB", "Alberta"],
      ["BC", "British Columbia"],
      ["MB", "Manitoba"],
      ["NB", "New Brunswick"],
      ["NL", "Newfoundland and Labrador"],
      ["NT", "Northwest Territories"],
      ["NS", "Nova Scotia"],
      ["NU", "Nunavut"],
      ["ON", "Ontario"],
      ["PE", "Prince Edward Island"],
      ["QC", "Quebec"],
      ["SK", "Saskatchewan"],
      ["YT", "Yukon"],
    ],
  },
};

export const isCountry = (code: string): code is CountryCode =>
  code in ZONES && Object.hasOwn(ZONES, code);

export const isZoneOf = (country: string, zone: string) =>
  isCountry(country) && ZONES[country].zones.some(([code]) => code === zone);

// A phone number in E.164 (+15555550123), as Shopify stores it: numbers in
// the US and Canada may be written without +1; others need their country
// code, and a "(0)" trunk digit after it is dropped (+44 (0)20 …). North
// American area codes start with 2 to 9. Shopify's address has no
// extension field, so an extension is refused rather than run into the
// number. null when it can't be read as a phone number.
export function toE164(raw: string, country: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (hasExtension(trimmed)) return null;
  if (/[^0-9+().\s-]/.test(trimmed)) return null;
  const international = trimmed.startsWith("+");
  const digits = (
    international ? trimmed.replace(/\(0\)/, "") : trimmed
  ).replace(/\D/g, "");
  if (international) {
    if (digits.startsWith("1")) return northAmerican(digits.slice(1));
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  }
  if (!isCountry(country)) return null;
  if (digits.length === 10) return northAmerican(digits);
  if (digits.length === 11 && digits.startsWith("1")) {
    return northAmerican(digits.slice(1));
  }
  return null;
}

// A US or Canadian number after the +1: ten digits, area code 2 to 9.
const northAmerican = (digits: string) =>
  /^[2-9]\d{9}$/.test(digits) ? `+1${digits}` : null;

export const hasExtension = (raw: string) =>
  /(\bext\.?|\bx|#)\s*\d+\s*$/i.test(raw);
