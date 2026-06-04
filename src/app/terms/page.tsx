import Link from "next/link";
import Image from "next/image";

export const metadata = {
  title: "Terms of Service | DUCTly",
  description: "DUCTly terms of service for duct cleaning and HVAC maintenance.",
};

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen" style={{ background: "rgb(255,255,255)" }}>
      {/* Header */}
      <nav className="h-[84px] flex items-center border-b" style={{ borderColor: "rgb(244,244,244)" }}>
        <div className="mx-auto w-full max-w-[800px] px-6 flex items-center justify-between">
          <Link href="/">
            <Image src="/images/logo.png" alt="DUCTly" width={130} height={40} className="h-[40px] w-auto object-contain" />
          </Link>
          <Link href="/" className="text-[14px] hover:opacity-70 transition-opacity" style={{ fontFamily: "var(--font-body)", color: "rgb(109,109,109)" }}>
            Back to home
          </Link>
        </div>
      </nav>

      <main className="mx-auto max-w-[800px] px-6 py-12">
        <h1
          className="text-[32px] md:text-[42px] font-normal tracking-[-0.04em] mb-2"
          style={{ fontFamily: "var(--font-heading)", color: "rgb(61,61,61)" }}
        >
          Terms of Service
        </h1>
        <p className="text-[14px] mb-10" style={{ fontFamily: "var(--font-body)", color: "rgb(160,165,175)" }}>
          Last updated: April 2026
        </p>

        <div className="space-y-8 text-[15px] leading-[1.8]" style={{ fontFamily: "var(--font-body)", color: "rgb(80,80,80)" }}>
          <section>
            <h2 className="text-[20px] font-medium mb-3" style={{ fontFamily: "var(--font-heading)", color: "rgb(61,61,61)" }}>1. Service Overview</h2>
            <p>DUCTly provides professional duct cleaning and HVAC maintenance services in the United Arab Emirates. By booking a service through our website, you agree to these terms.</p>
          </section>

          <section>
            <h2 className="text-[20px] font-medium mb-3" style={{ fontFamily: "var(--font-heading)", color: "rgb(61,61,61)" }}>2. Booking and Payment</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>All bookings require full payment at the time of scheduling.</li>
              <li>Prices are displayed in UAE Dirhams (AED) and are exclusive of VAT. 5% VAT is added at checkout and itemised on your tax invoice.</li>
              <li>Payment is processed securely by Stripe. We do not store credit card information.</li>
              <li>A booking confirmation will be sent to your registered email address.</li>
              <li>Time slots are reserved for 10 minutes during the booking process. Unpaid reservations are automatically released.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-[20px] font-medium mb-3" style={{ fontFamily: "var(--font-heading)", color: "rgb(61,61,61)" }}>3. Service Plans</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Essential Plan (AED 349/thermostat):</strong> Standard duct cleaning with inspection report.</li>
              <li><strong>Signature Plan (AED 549/thermostat):</strong> Deep cleaning with sanitization and before/after documentation.</li>
              <li><strong>Elite Plan (AED 649/thermostat):</strong> Premium service including mold treatment, coil cleaning, and extended warranty.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-[20px] font-medium mb-3" style={{ fontFamily: "var(--font-heading)", color: "rgb(61,61,61)" }}>4. Cancellation and Refunds</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>Cancellations made 24 hours or more before the scheduled service receive a full refund.</li>
              <li>Cancellations within 24 hours of the scheduled service are subject to a 25% cancellation fee.</li>
              <li>No-shows are non-refundable.</li>
              <li>To cancel, contact us at <a href="mailto:info@ductly.ae" className="underline" style={{ color: "rgb(60,140,130)" }}>info@ductly.ae</a> or call our support line.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-[20px] font-medium mb-3" style={{ fontFamily: "var(--font-heading)", color: "rgb(61,61,61)" }}>5. Service Delivery</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>Our service team will arrive within the booked time slot (90-minute window).</li>
              <li>Access to the property and HVAC system must be provided at the scheduled time.</li>
              <li>The property owner or an authorized representative must be present during the service.</li>
              <li>We reserve the right to reschedule if site conditions are unsafe or access is denied.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-[20px] font-medium mb-3" style={{ fontFamily: "var(--font-heading)", color: "rgb(61,61,61)" }}>6. Liability</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>DUCTly carries professional indemnity and public liability insurance.</li>
              <li>We are not liable for pre-existing damage to ductwork or HVAC systems.</li>
              <li>Any claims must be reported within 48 hours of service completion.</li>
              <li>Our total liability is limited to the amount paid for the specific service.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-[20px] font-medium mb-3" style={{ fontFamily: "var(--font-heading)", color: "rgb(61,61,61)" }}>7. Governing Law</h2>
            <p>These terms are governed by the laws of the United Arab Emirates. Any disputes shall be resolved in the courts of Dubai.</p>
          </section>

          <section>
            <h2 className="text-[20px] font-medium mb-3" style={{ fontFamily: "var(--font-heading)", color: "rgb(61,61,61)" }}>8. Contact</h2>
            <p>
              Email: <a href="mailto:info@ductly.ae" className="underline" style={{ color: "rgb(60,140,130)" }}>info@ductly.ae</a><br />
              DUCTly, Dubai, United Arab Emirates
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
