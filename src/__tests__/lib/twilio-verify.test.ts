import { describe, it, expect } from "vitest";
import { validateTwilioSignature } from "@/lib/twilio-verify";

// Inputs run through Twilio's documented algorithm (URL + sorted
// name+value concat, HMAC-SHA1, base64). The expected signature is the
// value that algorithm yields — pinning our impl to Twilio's helper.
const TOKEN = "12345";
const URL = "https://mycompany.com/myapp.php?foo=1&bar=2";
const PARAMS = {
  Digits: "1234",
  To: "+18005551212",
  From: "+14158675310",
  Caller: "+14158675310",
  CallSid: "CA1234567890ABCDE",
};
const VALID_SIG = "GvWf1cFY/Q7PnoempGyD5oXAezc=";

describe("validateTwilioSignature", () => {
  it("accepts a correctly-signed request", () => {
    expect(validateTwilioSignature(TOKEN, URL, PARAMS, VALID_SIG)).toBe(true);
  });

  it("is independent of param insertion order", () => {
    const shuffled = {
      CallSid: "CA1234567890ABCDE",
      From: "+14158675310",
      To: "+18005551212",
      Caller: "+14158675310",
      Digits: "1234",
    };
    expect(validateTwilioSignature(TOKEN, URL, shuffled, VALID_SIG)).toBe(true);
  });

  it("rejects a tampered param", () => {
    expect(
      validateTwilioSignature(TOKEN, URL, { ...PARAMS, Digits: "9999" }, VALID_SIG)
    ).toBe(false);
  });

  it("rejects the wrong auth token", () => {
    expect(validateTwilioSignature("wrong", URL, PARAMS, VALID_SIG)).toBe(false);
  });

  it("rejects a missing signature or token", () => {
    expect(validateTwilioSignature(TOKEN, URL, PARAMS, null)).toBe(false);
    expect(validateTwilioSignature("", URL, PARAMS, VALID_SIG)).toBe(false);
  });
});
