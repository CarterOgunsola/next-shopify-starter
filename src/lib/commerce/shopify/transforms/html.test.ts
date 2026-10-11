import { describe, expect, it } from "vitest";
import { sanitizeRichText } from "./html";

describe("sanitizeRichText", () => {
  it("removes scripts with their contents", () => {
    expect(
      sanitizeRichText("<p>Hi</p><script>alert('should never run')</script>"),
    ).toBe("<p>Hi</p>");
  });

  it.each([
    ['<img src="x" onerror="alert(1)">', '<img src="x" />'],
    ['<a href="javascript:alert(1)">x</a>', "<a>x</a>"],
    ['<p style="color:red" onclick="x()">x</p>', "<p>x</p>"],
    ['<iframe src="https://evil.test"></iframe>', ""],
    ["<form><input name=a></form>", ""],
    ['<img src="//evil.test/a.png">', "<img />"],
  ])("strips %s", (input, expected) => {
    expect(sanitizeRichText(input)).toBe(expected);
  });

  it("keeps formatting, lists, tables and safe links", () => {
    const html =
      '<p><strong>Bold</strong> <a href="https://example.com">link</a></p>' +
      "<ul><li>One</li></ul><table><tr><th>Col</th></tr><tr><td>A</td></tr></table>";
    expect(sanitizeRichText(html)).toBe(html);
  });

  it("moves headings down as far as asked, stopping at h6", () => {
    expect(sanitizeRichText("<h1>T</h1><h2>S</h2><h5>F</h5>", 2)).toBe(
      "<h3>T</h3><h4>S</h4><h6>F</h6>",
    );
  });

  it("sets rel itself and drops one from the editor", () => {
    expect(
      sanitizeRichText(
        '<a href="https://x.test" rel="opener" target="_blank">x</a><a href="https://y.test" rel="opener">y</a><a href="https://z.test" target="_top">z</a>',
      ),
    ).toBe(
      '<a href="https://x.test" target="_blank" rel="noopener noreferrer">x</a><a href="https://y.test">y</a><a href="https://z.test">z</a>',
    );
  });

  it("moves headings down a level and secures new-tab links", () => {
    expect(
      sanitizeRichText(
        '<h1>T</h1><h2>S</h2><a href="https://x.test" target="_blank">x</a>',
      ),
    ).toBe(
      '<h2>T</h2><h3>S</h3><a href="https://x.test" target="_blank" rel="noopener noreferrer">x</a>',
    );
  });
});
