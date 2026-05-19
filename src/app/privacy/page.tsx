import Link from "next/link";
import Image from "next/image";

export const metadata = {
  title: "Privacy Policy | DUCTly",
  description: "DUCTly privacy policy — how we collect, use, and protect your personal data.",
};

export default function PrivacyPolicyPage() {
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
          Privacy Policy
        </h1>
        <p className="text-[14px] mb-10" style={{ fontFamily: "var(--font-body)", color: "rgb(160,165,175)" }}>
          Last updated: 17 May 2026
        </p>

        <div className="space-y-8 text-[15px] leading-[1.8]" style={{ fontFamily: "var(--font-body)", color: "rgb(80,80,80)" }}>
          <section>
            <h2 className="text-[20px] font-medium mb-3" style={{ fontFamily: "var(--font-heading)", color: "rgb(61,61,61)" }}>1. Introduction</h2>
            <p>DUCTly (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) is a duct cleaning and HVAC maintenance service operating in the United Arab Emirates. This Privacy Policy explains how we collect, use, store, and protect your personal data in accordance with UAE Federal Decree-Law No. 45/2021 on the Protection of Personal Data (PDPL).</p>
          </section>

          <section>
            <h2 className="text-[20px] font-medium mb-3" style={{ fontFamily: "var(--font-heading)", color: "rgb(61,61,61)" }}>2. Data We Collect</h2>
            <p>We collect the following personal data when you book a service:</p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li><strong>Contact information:</strong> Full name, email address, phone number</li>
              <li><strong>Service address:</strong> Property address where the service will be performed</li>
              <li><strong>Property details:</strong> Property type (villa, apartment, office), number of bedrooms, number of thermostats</li>
              <li><strong>Payment data:</strong> Processed securely by Stripe — we never store your card details</li>
              <li><strong>Booking data:</strong> Selected date, time, and service plan</li>
            </ul>
          </section>

          <section>
            <h2 className="text-[20px] font-medium mb-3" style={{ fontFamily: "var(--font-heading)", color: "rgb(61,61,61)" }}>3. How We Use Your Data</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>To schedule and deliver our duct cleaning services</li>
              <li>To process payments via our payment provider (Stripe)</li>
              <li>To send booking confirmations and service reminders</li>
              <li>To assign the optimal service team based on location and availability</li>
              <li>To improve our scheduling and route optimization</li>
              <li>To respond to your inquiries and support requests</li>
            </ul>
          </section>

          <section>
            <h2 className="text-[20px] font-medium mb-3" style={{ fontFamily: "var(--font-heading)", color: "rgb(61,61,61)" }}>4. Data Storage and Security</h2>
            <p>Your data is stored securely using Supabase (hosted on AWS infrastructure). We implement industry-standard security measures including:</p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>Encryption in transit (TLS 1.2+) for all communications</li>
              <li>Row-level security policies on all database tables</li>
              <li>Service-role separation between public and admin access</li>
              <li>HTTPS-only connections with HSTS enforcement</li>
            </ul>
          </section>

          <section>
            <h2 className="text-[20px] font-medium mb-3" style={{ fontFamily: "var(--font-heading)", color: "rgb(61,61,61)" }}>5. Third-Party Services</h2>
            <p>We share your data with the following third parties, solely for service delivery:</p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li><strong>Stripe (Ireland):</strong> Payment processing — receives name, email, phone, billing address (PCI DSS compliant)</li>
              <li><strong>Supabase (AWS, EU):</strong> Database and authentication hosting — stores all booking and customer records</li>
              <li><strong>Google (Maps Platform):</strong> Address geocoding, autocomplete, and travel-time calculation — receives the service address you enter</li>
              <li><strong>360dialog (Germany):</strong> WhatsApp Business API provider that delivers booking confirmations and reminders — receives your phone number and the message contents. We expect to migrate to Twilio (USA) in 2026; this notice will be updated when the migration completes.</li>
              <li><strong>n8n (self-hosted by Ductly):</strong> Internal workflow automation that dispatches teams and triggers notifications — processes booking data on our infrastructure</li>
              <li><strong>OpenRouter (USA):</strong> LLM provider used for two distinct purposes. (1) Team-assignment optimisation: receives anonymised booking metadata only — no name, email, or phone. (2) Customer support chatbot on our landing page: receives the free-form messages you type into the chat widget along with the conversation history of that session. Do not paste sensitive personal information into the chatbot.</li>
            </ul>
            <p className="mt-2">We do not sell your data to any third party.</p>
          </section>

          <section>
            <h2 className="text-[20px] font-medium mb-3" style={{ fontFamily: "var(--font-heading)", color: "rgb(61,61,61)" }}>6. Your Rights</h2>
            <p>Under the UAE PDPL, you have the right to:</p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>Access your personal data we hold</li>
              <li>Request correction of inaccurate data</li>
              <li>Request deletion of your data (subject to legal obligations)</li>
              <li>Withdraw consent for data processing</li>
              <li>Object to automated decision-making</li>
            </ul>
            <p className="mt-3"><strong>Self-service:</strong> Every booking confirmation email includes a personal management link (e.g. <code className="text-[13px]">ductly.ae/manage/&lt;your-token&gt;</code>). Using that token you can:</p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li><strong>Download your data:</strong> <code className="text-[13px]">GET /api/me/export?token=&lt;your-token&gt;</code> returns a JSON file with every record we hold about you.</li>
              <li><strong>Delete your account:</strong> <code className="text-[13px]">POST /api/me/delete</code> with <code className="text-[13px]">{`{ "token": "<your-token>" }`}</code> anonymises your personal data. Booking and payment records are retained for the period required by UAE commercial law (see section 7), but your name, email, and phone number are removed.</li>
            </ul>
            <p className="mt-3">If you can&apos;t find your management link or need help, contact us at <a href="mailto:privacy@ductly.ae" className="underline" style={{ color: "rgb(60,140,130)" }}>privacy@ductly.ae</a>.</p>
          </section>

          <section>
            <h2 className="text-[20px] font-medium mb-3" style={{ fontFamily: "var(--font-heading)", color: "rgb(61,61,61)" }}>7. Data Retention</h2>
            <p>We retain your personal data for 24 months after your last booking. Payment, invoice, and tax records are retained for 5 years as required by UAE commercial and tax law (Federal Decree-Law No. 28 of 2022 on Tax Procedures). When you request deletion via Section 6, we anonymise your customer record immediately but retain the anonymised booking records until the 5-year period elapses.</p>
          </section>

          <section>
            <h2 className="text-[20px] font-medium mb-3" style={{ fontFamily: "var(--font-heading)", color: "rgb(61,61,61)" }}>8. Contact</h2>
            <p>For privacy-related inquiries:<br />
              Email: <a href="mailto:privacy@ductly.ae" className="underline" style={{ color: "rgb(60,140,130)" }}>privacy@ductly.ae</a><br />
              DUCTly, Dubai, United Arab Emirates
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
