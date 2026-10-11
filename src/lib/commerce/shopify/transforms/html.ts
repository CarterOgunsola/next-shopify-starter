import sanitizeHtml from "sanitize-html";

// Rich text from Shopify admin (product and collection descriptions) is
// rendered as HTML, so it goes through an allowlist first: no scripts,
// event handlers, styles, iframes or forms, whatever was pasted into the
// editor. Headings move down to fit under the page's own headings.
const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "p",
    "br",
    "hr",
    "strong",
    "b",
    "em",
    "i",
    "u",
    "s",
    "sub",
    "sup",
    "span",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "blockquote",
    "ul",
    "ol",
    "li",
    "a",
    "img",
    "table",
    "caption",
    "thead",
    "tbody",
    "tfoot",
    "tr",
    "th",
    "td",
  ],
  allowedAttributes: {
    // target and rel are set below, not taken from the editor.
    a: [
      "href",
      "title",
      { name: "target", values: ["_blank"] },
      { name: "rel", values: ["noopener noreferrer"] },
    ],
    img: ["src", "alt", "width", "height"],
    th: ["colspan", "rowspan", "scope"],
    td: ["colspan", "rowspan"],
  },
  allowedSchemes: ["https", "mailto"],
  allowedSchemesByTag: { img: ["https"] },
  allowProtocolRelative: false,
  transformTags: {
    // A new tab only as _blank, always with noopener noreferrer; any other
    // target or rel from the editor is dropped.
    a: (tagName, { target, rel: _rel, ...attribs }) => ({
      tagName,
      attribs:
        target === "_blank"
          ? { ...attribs, target, rel: "noopener noreferrer" }
          : attribs,
    }),
  },
  // Drop the contents of these too, not just the tags.
  nonTextTags: ["script", "style", "textarea", "noscript", "iframe", "object"],
};

// The h1 to h5 an editor used, moved down by `levels` (h6 at most).
function headings(levels: number): sanitizeHtml.IOptions["transformTags"] {
  return Object.fromEntries(
    [1, 2, 3, 4, 5].map((level) => [
      `h${level}`,
      `h${Math.min(level + levels, 6)}`,
    ]),
  );
}

// headingLevels: how far headings move down. 1 where the text sits right
// under the page's h1 (collections), 2 under an h2 (the product page's
// Description section).
export function sanitizeRichText(html: string, headingLevels = 1): string {
  return sanitizeHtml(html, {
    ...OPTIONS,
    transformTags: { ...headings(headingLevels), ...OPTIONS.transformTags },
  });
}
