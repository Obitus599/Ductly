"use client";

import { CARD, CTA, INPUT, LABEL } from "./shared";
import AddressPicker, { type AddressDetails } from "./AddressPicker";
import ContactVerify from "./ContactVerify";

interface DetailsStepProps {
  name: string;
  setName: (v: string) => void;
  email: string;
  setEmail: (v: string) => void;
  phone: string;
  setPhone: (v: string) => void;
  addressDetails: AddressDetails;
  setAddressDetails: (v: AddressDetails) => void;
  propertyType: "villa" | "apartment" | "office";
  setPropertyType: (v: "villa" | "apartment" | "office") => void;
  bedrooms: number;
  setBedrooms: (v: number) => void;
  thermostats: number;
  setThermostats: (v: number) => void;
  onContinue: () => void;
  valid: boolean;
  /** #7: when true, render the email/phone OTP verification UI. */
  verificationEnabled: boolean;
  emailVerified: boolean;
  setEmailVerified: (v: boolean) => void;
  phoneVerified: boolean;
  setPhoneVerified: (v: boolean) => void;
}

export default function DetailsStep({
  name, setName, email, setEmail, phone, setPhone,
  addressDetails, setAddressDetails, propertyType, setPropertyType,
  bedrooms, setBedrooms, thermostats, setThermostats,
  onContinue, valid,
  verificationEnabled, emailVerified, setEmailVerified, phoneVerified, setPhoneVerified,
}: DetailsStepProps) {
  const emailValid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
  const phoneDigits = phone.replace(/[^0-9]/g, "");
  const phoneValid = phoneDigits.length >= 7 && phoneDigits.length <= 15;
  return (
    <div className="p-7 md:p-10" style={CARD}>
      <h2
        className="text-[22px] font-normal tracking-[-0.03em] text-[rgb(61,61,61)] mb-7"
        style={{ fontFamily: "var(--font-heading)" }}
      >
        Your Details
      </h2>

      <div className="space-y-5">
        {/* Name */}
        <div>
          <label htmlFor="book-name" className={LABEL} style={{ fontFamily: "var(--font-body)" }}>
            Full Name
          </label>
          <input
            id="book-name" type="text" value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Ahmed Al Mansoori"
            className={INPUT} style={{ fontFamily: "var(--font-body)" }}
          />
        </div>

        {/* Email + Mobile */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <label htmlFor="book-email" className={LABEL} style={{ fontFamily: "var(--font-body)" }}>
              Email
            </label>
            <input
              id="book-email" type="email" value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ahmed@example.com"
              className={INPUT} style={{ fontFamily: "var(--font-body)" }}
            />
            {verificationEnabled && (
              <ContactVerify
                channel="email"
                value={email.trim()}
                valueValid={emailValid}
                verified={emailVerified}
                onVerifiedChange={setEmailVerified}
              />
            )}
          </div>
          <div>
            <label htmlFor="book-phone" className={LABEL} style={{ fontFamily: "var(--font-body)" }}>
              Mobile
            </label>
            <input
              id="book-phone" type="tel" value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+971 50 123 4567"
              className={INPUT} style={{ fontFamily: "var(--font-body)" }}
            />
            {verificationEnabled && (
              <ContactVerify
                channel="sms"
                value={phone.trim()}
                valueValid={phoneValid}
                verified={phoneVerified}
                onVerifiedChange={setPhoneVerified}
              />
            )}
          </div>
        </div>

        {/* Address — map picker + structured fields */}
        <AddressPicker value={addressDetails} onChange={setAddressDetails} />

        {/* Property Details */}
        <div className="border-t-2 border-[rgb(244,244,244)] pt-6 mt-1">
          <h3
            className="text-[18px] font-normal tracking-[-0.02em] text-[rgb(61,61,61)] mb-5"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            Property Details
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label htmlFor="book-property" className={LABEL} style={{ fontFamily: "var(--font-body)" }}>
                Type of Property
              </label>
              <div className="relative">
                <select
                  id="book-property" value={propertyType}
                  onChange={(e) => {
                    const v = e.target.value as "villa" | "apartment" | "office";
                    setPropertyType(v);
                    if (v === "office") setBedrooms(0);
                    else if (v === "villa" && bedrooms === 0) setBedrooms(1);
                  }}
                  className={INPUT}
                  style={{ fontFamily: "var(--font-body)", appearance: "none", paddingRight: "40px" }}
                >
                  <option value="apartment">Apartment</option>
                  <option value="villa">Villa</option>
                  <option value="office">Office</option>
                </select>
                <svg className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgb(160,165,175)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </div>
            </div>

            {propertyType !== "office" && (
            <div>
              <label htmlFor="book-bedrooms" className={LABEL} style={{ fontFamily: "var(--font-body)" }}>
                Number of Bedrooms
              </label>
              <div className="relative">
                <select
                  id="book-bedrooms" value={bedrooms}
                  onChange={(e) => setBedrooms(Number(e.target.value))}
                  className={INPUT}
                  style={{ fontFamily: "var(--font-body)", appearance: "none", paddingRight: "40px" }}
                >
                  {propertyType === "apartment" && <option value={0}>Studio</option>}
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
                <svg className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgb(160,165,175)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </div>
            </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mt-5">
            <div>
              <label htmlFor="book-thermostats" className={LABEL} style={{ fontFamily: "var(--font-body)" }}>
                Number of Thermostats
              </label>
              <div className="relative">
                <select
                  id="book-thermostats" value={thermostats}
                  onChange={(e) => setThermostats(Number(e.target.value))}
                  className={INPUT}
                  style={{ fontFamily: "var(--font-body)", appearance: "none", paddingRight: "40px" }}
                >
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
                <svg className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgb(160,165,175)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </div>

      <button
        type="button" disabled={!valid} onClick={onContinue}
        className="w-full mt-8 px-6 py-4 text-[16px] text-white hover:brightness-110 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
        style={CTA}
      >
        Continue to Schedule
      </button>
    </div>
  );
}
