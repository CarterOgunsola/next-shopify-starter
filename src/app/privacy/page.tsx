import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  alternates: { canonical: "/privacy" },
};

// PLACEHOLDER: replace with your privacy policy, written or approved by the store's
// counsel, before launch.
export default function PrivacyPage() {
  return (
    <article>
      <h1>Privacy Policy</h1>
      <p>
        <strong>[Placeholder, pending legal review]</strong> This page has no
        approved text yet.
      </p>
    </article>
  );
}
