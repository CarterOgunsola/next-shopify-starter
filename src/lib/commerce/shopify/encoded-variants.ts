// Decodes Shopify's encodedVariantExistence and encodedVariantAvailability
// strings ("v1_" format, documented on the Product object) into one array of
// option-value indexes per variant, e.g. [2, 0, 1] = third value of the first
// option, first of the second, second of the third.
//
// Control characters: ":" goes one option deeper, " " separates values,
// "-" is an inclusive range, and each "," closes one level of shared prefix.
export function decodeEncodedVariants(
  encoded: string | null | undefined,
): number[][] {
  if (!encoded?.startsWith("v1_")) return [];
  const body = encoded.slice(3);
  const combinations: number[][] = [];
  const current: number[] = [];
  let depth = 0;
  let start = 0;
  let rangeStart: number | null = null;

  const closeRange = (endExclusive: number) => {
    if (rangeStart === null) return;
    for (let value = rangeStart; value < endExclusive; value++) {
      current[depth] = value;
      combinations.push([...current]);
    }
    rangeStart = null;
  };

  const tokenizer = /[ :,-]/g;
  let token: RegExpExecArray | null;
  while ((token = tokenizer.exec(body))) {
    const operator = token[0];
    const value = Number.parseInt(body.slice(start, token.index), 10) || 0;
    closeRange(value);
    current[depth] = value;
    if (operator === "-") {
      rangeStart = value;
    } else if (operator === ":") {
      depth++;
    } else {
      // A value ends here, unless this "," closes another level right after
      // a previous ",".
      if (operator === " " || body[token.index - 1] !== ",") {
        combinations.push([...current]);
      }
      if (operator === ",") {
        current.pop();
        depth--;
      }
    }
    start = tokenizer.lastIndex;
  }

  const last = /\d+$/.exec(body)?.[0];
  if (last !== undefined) {
    const value = Number.parseInt(last, 10);
    if (rangeStart !== null) {
      closeRange(value + 1);
    } else {
      current[depth] = value;
      combinations.push([...current]);
    }
  }
  return combinations;
}

export function combinationKey(indexes: readonly number[]): string {
  return indexes.join(":");
}
