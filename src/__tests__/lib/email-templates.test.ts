import { describe, it, expect } from "vitest";
import { renderVerificationEmail } from "@/lib/email-templates";

describe("renderVerificationEmail", () => {
  const { subject, html, text } = renderVerificationEmail("482913", 10);

  it("interpolates the code into subject, html and text", () => {
    expect(subject).toContain("482913");
    expect(html).toContain("482913");
    expect(text).toContain("482913");
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
