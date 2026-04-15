"use client";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6">
      <h1
        className="text-[36px] md:text-[48px] font-normal leading-[1.1] tracking-[-0.04em] text-[rgb(61,61,61)] mb-4"
        style={{ fontFamily: "var(--font-heading)" }}
      >
        Something went wrong
      </h1>
      <p
        className="text-[18px] text-[rgb(109,109,109)] mb-8 text-center max-w-[400px]"
        style={{ fontFamily: "var(--font-body)" }}
      >
        An unexpected error occurred. Please try again.
      </p>
      <button
        type="button"
        onClick={reset}
        className="inline-flex items-center justify-center px-6 py-3 text-[16px] text-white leading-[150%] hover:brightness-110 transition-all duration-200"
        style={{
          background: "linear-gradient(135deg, rgb(147,216,216) 0%, rgb(149,207,140) 100%)",
          borderRadius: 40,
          boxShadow: "0px 4px 8px 0px rgba(0,0,0,0.15)",
          fontFamily: "var(--font-cta)",
          fontWeight: 500,
        }}
      >
        Try again
      </button>
    </div>
  );
}
