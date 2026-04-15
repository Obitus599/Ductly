import Link from "next/link";
import Image from "next/image";

export default function BookingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen" style={{ background: "rgb(250,250,250)" }}>
      <header className="bg-white border-b border-[rgb(244,244,244)]">
        <div className="mx-auto max-w-3xl flex items-center justify-between px-6 h-16">
          <Link href="/" className="shrink-0">
            <Image
              src="/images/logo.png"
              alt="DUCTly"
              width={140}
              height={44}
              className="h-[44px] w-auto object-contain"
            />
          </Link>
          <Link
            href="/"
            className="text-[14px] text-[rgb(153,153,153)] hover:text-[rgb(61,61,61)] transition-colors"
            style={{ fontFamily: "var(--font-body)" }}
          >
            &larr; Back to home
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-10">{children}</main>
    </div>
  );
}
