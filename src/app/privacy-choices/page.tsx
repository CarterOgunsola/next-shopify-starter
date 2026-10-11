import type { Metadata } from "next";
import { PrivacyChoices } from "@/components/consent/privacy-choices";

export const metadata: Metadata = {
  title: "Your Privacy Choices",
};

// PLACEHOLDER copy: the store's counsel provides the final wording before
// launch. The opt-out itself (PrivacyChoices) works as is.
export default function PrivacyChoicesPage() {
  return (
    <article>
      <h1>Your Privacy Choices</h1>
      <p>
        <strong>[Placeholder, pending legal review]</strong> This page has no
        approved text yet.
      </p>
      <p>
        You can opt out of the sale or sharing of your personal information,
        including for targeted advertising. If your browser sends a Global
        Privacy Control signal, we treat it as an opt-out.
      </p>
      <PrivacyChoices />
    </article>
  );
}
