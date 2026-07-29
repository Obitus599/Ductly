import { describe, it, expect } from "vitest";
import { renderVerificationEmail } from "@/lib/email-templates";

describe("renderVerificationEmail", () => {
  const { subject, html, text } = renderVerificationEmail("482913", 10);

  it("interpolates the code into html and text", () => {
    expect(html).toContain("482913");
    expect(text).toContain("482913");
  });

  it("keeps the code OUT of the subject line", () => {
    // Subjects surface in lock-screen previews, mail-list views and mail
    // server logs — all places the body doesn't reach.
    expect(subject).not.toContain("482913");
    expect(subject).toBe("Your Ductly verification code");
  });

  it("interpolates the TTL", () => {
    expect(html).toContain("10 minutes");
    expect(text).toContain("10 minutes");
  });

  it("never leaks raw template markup (the bug this replaced)", () => {
    expect(subject).not.toContain("{{");
    expect(html).not.toContain("{{");
    expect(text).not.toContain("{{");
    expect(html).not.toContain("$json");
  });

  it("produces a complete HTML document", () => {
    expect(html.trimStart().startsWith("<!DOCTYPE html>")).toBe(true);
  });
});
