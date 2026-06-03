"use client";

import { useState, useRef, useEffect, type ReactNode } from "react";
import { motion, useInView } from "framer-motion";
import Link from "next/link";
import ChatWidget from "@/components/ChatWidget";
import Image from "next/image";

/* ─── Animation ──────────────────────────────────────────────────────────── */

const spring = { type: "spring" as const, damping: 58, stiffness: 400, mass: 1 };

function FadeUp({ children, delay = 0, className = "" }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.1 });
  return (
    <motion.div ref={ref} initial={{ opacity: 0, y: 20 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ ...spring, delay }} className={className}>
      {children}
    </motion.div>
  );
}

function ScaleIn({ children, delay = 0, className = "" }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.1 });
  return (
    <motion.div ref={ref} initial={{ opacity: 0, scale: 0.8 }} animate={inView ? { opacity: 1, scale: 1 } : {}} transition={{ ...spring, delay }} className={className}>
      {children}
    </motion.div>
  );
}

/* ─── Shared ─────────────────────────────────────────────────────────────── */

const CARD_STYLE: React.CSSProperties = {
  background: "linear-gradient(180deg, rgb(255,255,255) 0%, rgb(244,244,244) 69.71%, rgb(250,250,250) 100%)",
  border: "2px solid rgb(244,244,244)",
  borderRadius: 20,
  boxShadow: "0px 0.6px 1.57px -1.5px rgba(0,0,0,0.17), 0px 2.29px 5.95px -3px rgba(0,0,0,0.14), 0px 10px 26px -4.5px rgba(0,0,0,0.02)",
};

const CTA_STYLE: React.CSSProperties = {
  background: "linear-gradient(135deg, rgb(147,216,216) 0%, rgb(149,207,140) 100%)",
  borderRadius: 40,
  boxShadow: "0px 4px 8px 0px rgba(0,0,0,0.15)",
  fontFamily: "var(--font-cta)",
  fontWeight: 500,
  letterSpacing: "-0.02em",
};

function CTAButton({ children, href, className = "" }: { children: ReactNode; href: string; className?: string }) {
  return (
    <Link href={href} className={`inline-flex items-center justify-center px-6 py-3 text-[16px] text-white leading-[150%] hover:brightness-110 transition-all duration-200 ${className}`} style={CTA_STYLE}>
      {children}
    </Link>
  );
}

function CheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="shrink-0 mt-[3px]">
      <circle cx="9" cy="9" r="9" fill="rgb(149,207,140)" fillOpacity="0.15" />
      <path d="M5.5 9.5L7.5 11.5L12.5 6.5" stroke="rgb(149,207,140)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ─── Navbar ─────────────────────────────────────────────────────────────── */

const NAV_LINKS = [
  { label: "Features", id: "feature" },
  { label: "Pricing", id: "pricing" },
  { label: "FAQ", id: "faq" },
];

function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  return (
    <>
      <nav className={`fixed top-0 left-0 right-0 z-50 h-[84px] flex items-center transition-all duration-300 ${scrolled ? "backdrop-blur-[5px] shadow-sm" : ""}`} style={{ backgroundColor: scrolled ? "rgba(255,255,255,0.9)" : "rgb(255,255,255)" }}>
        <div className="mx-auto w-full max-w-[1300px] px-6 lg:px-[80px] flex items-center justify-between">
          <Link href="/" className="shrink-0">
            <Image src="/images/logo.png" alt="DUCTly" width={160} height={50} className="h-[50px] w-auto object-contain" priority />
          </Link>
          <div className="flex items-center gap-6">
            {NAV_LINKS.map((l) => (
              <a key={l.id} href={`#${l.id}`} className="hidden md:block text-[16px] font-medium text-[rgb(109,109,109)] hover:text-black transition-colors" style={{ fontFamily: "var(--font-body)" }}>
                {l.label}
              </a>
            ))}
            <CTAButton href="#pricing">Get started</CTAButton>
            {/* Hamburger — mobile only */}
            <button type="button" onClick={() => setMobileOpen(true)} className="md:hidden flex flex-col justify-center gap-[5px] w-8 h-8" aria-label="Open menu">
              <span className="block w-6 h-[2px] bg-[rgb(61,61,61)] rounded-full" />
              <span className="block w-6 h-[2px] bg-[rgb(61,61,61)] rounded-full" />
              <span className="block w-4 h-[2px] bg-[rgb(61,61,61)] rounded-full" />
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-[60] md:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setMobileOpen(false)} />
          <div className="absolute top-0 right-0 w-[280px] h-full bg-white shadow-xl p-8 flex flex-col gap-6">
            <button type="button" onClick={() => setMobileOpen(false)} className="self-end text-[24px] text-[rgb(109,109,109)] leading-none" aria-label="Close menu">&times;</button>
            {NAV_LINKS.map((l) => (
              <a key={l.id} href={`#${l.id}`} onClick={() => setMobileOpen(false)} className="text-[18px] font-medium text-[rgb(61,61,61)] hover:text-black transition-colors" style={{ fontFamily: "var(--font-body)" }}>
                {l.label}
              </a>
            ))}
            <CTAButton href="#pricing">Get started</CTAButton>
          </div>
        </div>
      )}
    </>
  );
}

/* ─── Hero ────────────────────────────────────────────────────────────────── */

function HeroSection() {
  return (
    <section className="pt-[84px]">
      <div className="mx-auto max-w-[1300px] px-6 lg:px-[80px] pt-12 lg:pt-16">
        {/* Text row */}
        <header className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6 lg:gap-8 mb-8">
          <div className="lg:w-[45%]">
            <FadeUp>
              <h1 className="text-[36px] md:text-[48px] lg:text-[60px] font-normal leading-[1.1] tracking-[-0.04em] text-[rgb(61,61,61)]" style={{ fontFamily: "var(--font-heading)" }}>
                Clean air shouldn&apos;t be a compromise
              </h1>
            </FadeUp>
            <FadeUp delay={0.1}>
              <p className="mt-4 text-[16px] lg:text-[18px] leading-[1.4] tracking-[-0.03em] text-[rgb(109,109,109)]" style={{ fontFamily: "var(--font-body)" }}>
                UAE&apos;s most trusted duct cleaning and maintenance company
              </p>
            </FadeUp>
          </div>
          <div className="lg:w-[50%] flex flex-col items-start lg:items-end gap-5 lg:pt-2">
            <FadeUp delay={0.2}>
              <p className="text-[16px] lg:text-[18px] leading-[1.4] tracking-[-0.03em] text-[rgb(109,109,109)] lg:text-right max-w-[520px]" style={{ fontFamily: "var(--font-body)" }}>
                We remove dust, allergens, and debris from your HVAC system so your family can breathe the cleanest air possible while saving on energy bills.
              </p>
            </FadeUp>
            <FadeUp delay={0.3}>
              <CTAButton href="#pricing">Get started</CTAButton>
            </FadeUp>
          </div>
        </header>

        {/* Hero visual */}
        <div className="relative">
          <ScaleIn delay={0.1}>
            <div className="relative w-full aspect-[16/9] rounded-[20px] overflow-hidden">
              <Image src="/images/hero-mockup.png" alt="Ductly dashboard" fill className="object-contain" sizes="(max-width: 1300px) 100vw, 1140px" priority />
            </div>
          </ScaleIn>

          {/* Floating green badges */}
          <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ ...spring, delay: 0.5 }} className="absolute top-[8%] right-[5%] lg:right-[15%] hidden md:flex items-center gap-2 px-5 py-3 rounded-[40px] text-black text-[14px] font-medium" style={{ backgroundColor: "rgb(149,207,140)", boxShadow: "4px 4px 12px 0px rgba(0,0,0,0.25)", fontFamily: "var(--font-body)" }}>
            Reduced mold and dust
          </motion.div>

          <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ ...spring, delay: 0.6 }} className="absolute bottom-[12%] left-[3%] lg:left-[8%] hidden md:flex items-center gap-2 px-5 py-3 rounded-[40px] text-black text-[14px] font-medium" style={{ backgroundColor: "rgb(149,207,140)", boxShadow: "4px 4px 12px 0px rgba(0,0,0,0.25)", fontFamily: "var(--font-body)" }}>
            Improved air quality and better cooling
          </motion.div>

          {/* Hero stat cards */}
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", bounce: 0.2, duration: 0.4, delay: 0.5 }} className="absolute top-[6%] left-[3%] hidden md:block bg-white rounded-[16px] px-5 py-4 border border-[rgb(244,244,244)]" style={{ boxShadow: "0px 4px 8px rgba(0,0,0,0.08), inset 0 0 0 1px rgb(244,244,244)" }}>
            <div className="text-[24px] font-medium text-[rgb(61,61,61)] leading-none" style={{ fontFamily: "var(--font-stat)" }}>99.7%</div>
            <div className="text-[12px] text-[rgb(153,153,153)] mt-1" style={{ fontFamily: "var(--font-body)" }}>Air purity achieved</div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", bounce: 0.2, duration: 0.4, delay: 0.6 }} className="absolute bottom-[8%] right-[3%] hidden md:block bg-white rounded-[16px] px-5 py-4 border border-[rgb(244,244,244)]" style={{ boxShadow: "0px 4px 8px rgba(0,0,0,0.08), inset 0 0 0 1px rgb(244,244,244)" }}>
            <div className="text-[24px] font-medium text-[rgb(61,61,61)] leading-none" style={{ fontFamily: "var(--font-stat)" }}>100+</div>
            <div className="text-[12px] text-[rgb(153,153,153)] mt-1" style={{ fontFamily: "var(--font-body)" }}>Units cleaned</div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

/* ─── Logo Marquee ───────────────────────────────────────────────────────── */

const logoStyles: { name: string; style: React.CSSProperties; icon?: boolean }[] = [
  { name: "Logoipsum", style: { fontFamily: "Georgia, serif", fontWeight: 400, fontSize: 18, fontStyle: "italic" }, icon: true },
  { name: "LOGOIPSUM", style: { fontFamily: "'Inter Tight', sans-serif", fontWeight: 700, fontSize: 16, letterSpacing: "0.08em" } },
  { name: "Logoipsum", style: { fontFamily: "var(--font-heading)", fontWeight: 400, fontSize: 20 } },
  { name: "LOGOIPSUM", style: { fontFamily: "'Inter', sans-serif", fontWeight: 700, fontSize: 16, letterSpacing: "0.04em" }, icon: true },
  { name: "Logoipsum", style: { fontFamily: "var(--font-body)", fontWeight: 700, fontSize: 20, fontStyle: "italic" } },
  { name: "Logoipsum", style: { fontFamily: "Georgia, serif", fontWeight: 700, fontSize: 20, fontStyle: "italic" } },
];

function LogoMarquee() {
  return (
    <section className="py-14 overflow-hidden">
      <p className="text-center text-[16px] text-[rgb(153,153,153)] tracking-[-0.02em] mb-8" style={{ fontFamily: "var(--font-body)" }}>
        Trusted by the leaders
      </p>
      <div className="marquee-mask">
        <div className="flex animate-marquee-left items-center" style={{ width: "300%" }}>
          {[0, 1, 2].map((s) => (
            <div key={s} className="flex shrink-0 items-center justify-around" style={{ width: "33.33%" }}>
              {logoStyles.map((logo, i) => (
                <div key={`${s}-${i}`} className="flex items-center gap-2 mx-8 shrink-0 opacity-40 select-none">
                  {logo.icon && <div className="w-[24px] h-[24px] rounded-[6px] bg-[rgb(190,190,190)]" />}
                  <span className="text-[rgb(174,174,174)] whitespace-nowrap" style={logo.style}>{logo.name}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Features ───────────────────────────────────────────────────────────── */

const features = [
  { title: "Improved Indoor Air Quality", desc: "Removes harmful allergens and irritants from the air you breathe every day.", img: "/images/feature-card-1.png" },
  { title: "Enhanced Energy Efficiency", desc: "A clean HVAC system doesn't have to work as hard to push air, lowering your monthly utility bills.", img: "/images/feature-icon-a.svg" },
  { title: "Odor Elimination", desc: "Clears out trapped particles that cause musty, stale smells from pets, cooking, or smoking.", img: "/images/feature-card-2.png" },
];

function FeaturesSection() {
  return (
    <section id="feature" className="py-16">
      <div className="mx-auto max-w-[1300px] px-6 lg:px-[80px]">
        <FadeUp delay={0.1}>
          <h2 className="text-[32px] md:text-[48px] font-normal leading-[1.2] tracking-[-0.05em] text-[rgb(61,61,61)] text-center mb-12" style={{ fontFamily: "var(--font-heading)" }}>
            It&apos;s Not Just Duct Cleaning
          </h2>
        </FadeUp>

        {/* Top 3 cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-5">
          {features.map((f, i) => (
            <ScaleIn key={f.title} delay={0.15 + i * 0.1}>
              <div className="p-[32px] h-full flex flex-col" style={CARD_STYLE}>
                <h3 className="text-[24px] font-normal text-[rgb(89,89,89)] mb-2 leading-[1.3] tracking-[-0.03em]" style={{ fontFamily: "var(--font-heading)" }}>{f.title}</h3>
                <p className="text-[16px] text-[rgb(109,109,109)] leading-[1.4] tracking-[-0.02em] mb-6" style={{ fontFamily: "var(--font-body)" }}>{f.desc}</p>
                <div className="mt-auto relative w-full h-[163px] rounded-[12px] overflow-hidden">
                  <Image src={f.img} alt={f.title} fill className={f.img.endsWith('.svg') ? "object-contain" : "object-cover"} sizes="400px" />
                </div>
              </div>
            </ScaleIn>
          ))}
        </div>

        {/* Bottom full-width card */}
        <ScaleIn delay={0.5}>
          <div className="p-[32px] flex flex-col md:flex-row md:items-center gap-6" style={CARD_STYLE}>
            <div className="md:flex-1">
              <h3 className="text-[24px] font-normal text-[rgb(89,89,89)] mb-2 leading-[1.3] tracking-[-0.03em]" style={{ fontFamily: "var(--font-heading)" }}>Extended HVAC Lifespan</h3>
              <p className="text-[16px] text-[rgb(109,109,109)] leading-[1.4] tracking-[-0.02em] max-w-[520px]" style={{ fontFamily: "var(--font-body)" }}>
                Reduces wear and tear on your expensive heating and cooling equipment by improving airflow.
              </p>
            </div>
            <div className="relative w-full md:w-[280px] h-[163px] rounded-[12px] overflow-hidden shrink-0">
              <Image src="/images/feature-icon-b.svg" alt="HVAC Lifespan" fill className="object-contain" sizes="280px" />
            </div>
          </div>
        </ScaleIn>
      </div>
    </section>
  );
}

/* ─── Process ────────────────────────────────────────────────────────────── */

const processIcons = [
  // 01 — sparkle/clean (starburst with radiating lines)
  <svg key="i1" width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="2.5" stroke="#fff" strokeWidth="1.5"/><line x1="9" y1="1" x2="9" y2="4" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/><line x1="9" y1="14" x2="9" y2="17" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/><line x1="1" y1="9" x2="4" y2="9" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/><line x1="14" y1="9" x2="17" y2="9" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/><line x1="3.3" y1="3.3" x2="5.4" y2="5.4" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/><line x1="12.6" y1="12.6" x2="14.7" y2="14.7" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/><line x1="3.3" y1="14.7" x2="5.4" y2="12.6" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/><line x1="12.6" y1="5.4" x2="14.7" y2="3.3" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/></svg>,
  // 02 — stopwatch
  <svg key="i2" width="16" height="18" viewBox="0 0 16 18" fill="none"><circle cx="8" cy="10.5" r="6" stroke="#fff" strokeWidth="1.5"/><line x1="8" y1="7" x2="8" y2="10.5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/><line x1="8" y1="10.5" x2="10.5" y2="10.5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/><line x1="6.5" y1="1.5" x2="9.5" y2="1.5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/><line x1="8" y1="1.5" x2="8" y2="4.5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/></svg>,
  // 03 — trending up arrow
  <svg key="i3" width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 12l4-4 3 3 5-5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><path d="M10 6h4v4" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>,
];

const processSteps = [
  { num: "01", title: "Residential Air Duct Cleaning", desc: "Your home deserves clean, healthy air. We deep-clean your entire duct system — clearing out the dust, allergens, and debris that build up over the years — so every room breathes fresher and your AC runs more efficiently.", img: "/images/process-1.png" },
  { num: "02", title: "Commercial Air Duct Cleaning", desc: "A clean workplace is a productive workplace. We help businesses improve indoor air quality for employees and customers, helping you meet health and safety standards while reducing facility energy costs.", img: "/images/process-2.png" },
  { num: "03", title: "Mold Elimination", desc: "Mold growth can damage your home and harm your health. Our professional mold cleaning service removes hazardous mold buildup, restores healthy air quality, and protects your home from recurring problems.", img: "/images/process.png" },
];

function ProcessSection() {
  return (
    <section className="py-16">
      <div className="mx-auto max-w-[1300px] px-6 lg:px-[80px]">
        <div className="flex flex-col lg:flex-row gap-10 lg:gap-16">
          {/* Left — sticky heading */}
          <div className="lg:w-[40%]">
            <div className="lg:sticky lg:top-[120px]">
              <FadeUp delay={0.1}>
                <h2 className="text-[32px] md:text-[48px] font-normal leading-[1.2] tracking-[-0.05em] text-[rgb(61,61,61)] max-w-[700px]" style={{ fontFamily: "var(--font-heading)" }}>
                  We offer comprehensive ventilation cleaning services for every type of property.
                </h2>
              </FadeUp>
            </div>
          </div>

          {/* Right — stacking cards */}
          <div className="lg:w-[60%]">
            {processSteps.map((step, i) => (
              <div key={step.num} className="lg:sticky lg:h-auto mb-5 last:mb-0" style={{ top: `${120 + i * 20}px`, zIndex: i + 1 }}>
                <ScaleIn delay={0.15 + i * 0.1}>
                  <div className="p-[32px] relative overflow-hidden" style={{ ...CARD_STYLE, boxShadow: "0px 4px 20px -4px rgba(0,0,0,0.12), 0px 0.6px 1.57px -1.5px rgba(0,0,0,0.17)" }}>
                    <div className="flex items-start gap-3 mb-1">
                      <div className="w-[40px] h-[40px] rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: "rgb(147,216,216)" }}>
                        {processIcons[i]}
                      </div>
                      <h3 className="text-[24px] font-normal text-[rgb(89,89,89)] leading-[1.3] tracking-[-0.03em]" style={{ fontFamily: "var(--font-heading)" }}>{step.title}</h3>
                    </div>
                    <p className="text-[16px] text-[rgb(109,109,109)] leading-[1.4] tracking-[-0.02em] mb-5 ml-[52px]" style={{ fontFamily: "var(--font-body)" }}>{step.desc}</p>
                    <div className="relative w-full h-[240px] flex items-center justify-center overflow-hidden">
                      <Image src={step.img} alt={step.title} width={280} height={200} className="object-contain" />
                    </div>
                    <div className="absolute bottom-4 right-5 px-3 py-1 rounded-full bg-[rgb(244,244,244)] text-[14px] text-[rgb(174,174,174)] tracking-[-0.02em]" style={{ fontFamily: "var(--font-body)" }}>{step.num}</div>
                  </div>
                </ScaleIn>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── Pricing ────────────────────────────────────────────────────────────── */

const PRICING_CARD_STYLE: React.CSSProperties = {
  background: "linear-gradient(117deg, rgb(244,244,244) 0%, rgb(250,250,250) 100%)",
  border: "1px solid rgb(255,255,255)",
  borderRadius: 16,
  boxShadow: "0px 6px 8px 0px rgba(0,0,0,0.05)",
};

const PRICING_BTN_STYLE: React.CSSProperties = {
  background: "linear-gradient(135deg, rgb(147,216,216) 0%, rgb(149,207,140) 100%)",
  borderRadius: 40,
  boxShadow: "0px 4px 8px 0px rgba(0,0,0,0.15)",
  fontFamily: "var(--font-cta)",
  fontWeight: 500,
  letterSpacing: "-0.02em",
};

const plans = [
  {
    name: "Essential", price: "349", tagline: "Basic duct vacuuming. Perfect for light maintenance.",
    cta: "Select Essential", best: false,
    features: ["TurboClean\u2122", "Fan coil unit cleaning", "HEPA vacuuming", "Filter cleaning"],
  },
  {
    name: "Signature", price: "549", tagline: "Full medical-grade sanitizations and restoration.",
    cta: "Select Signature", best: true,
    features: ["TurboClean\u2122", "Filter cleaning", "Fan coil unit cleaning", "Fumigation", "Bio-enzyme disinfection", "Mold remediation treatment", "Black mold remediation"],
  },
  {
    name: "Elite", price: "649", tagline: "Ultimate protection with 12-month air purity guarantee.",
    cta: "Select Elite", best: false,
    features: ["TurboClean\u2122", "Filter cleaning", "Fan coil unit cleaning", "Fumigation", "Bio-enzyme disinfection", "Mold remediation treatment", "Black mold remediation", "AC unit coil deep clean", "Air quality analysis"],
  },
];

function PricingSection() {
  return (
    <section id="pricing" className="py-16">
      <div className="mx-auto max-w-[1300px] px-6 lg:px-[80px]">
        <FadeUp delay={0.1}>
          <h2 className="text-[32px] md:text-[48px] font-normal leading-[1.2] tracking-[-0.05em] text-[rgb(61,61,61)] text-center mb-12" style={{ fontFamily: "var(--font-heading)" }}>
            Simple Plans, Clear Value
          </h2>
        </FadeUp>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-start">
          {plans.map((plan, i) => (
            <ScaleIn key={plan.name} delay={0.15 + i * 0.1}>
              {plan.best ? (
                <div className="rounded-[20px] p-[3px]" style={{ background: "linear-gradient(208deg, rgb(149,207,140) 0%, rgb(147,216,216) 35%)" }}>
                  <div className="p-7 flex flex-col relative" style={{ ...PRICING_CARD_STYLE, borderRadius: 18 }}>
                    <div className="absolute top-5 right-5 text-[14px] text-white px-4 py-1.5 rounded-[40px]" style={{ background: "linear-gradient(135deg, rgb(147,216,216), rgb(149,207,140))", fontFamily: "var(--font-badge)", letterSpacing: "-0.02em" }}>
                      Best Deal
                    </div>
                    <PricingCardContent plan={plan} />
                  </div>
                </div>
              ) : (
                <div className="p-7 flex flex-col" style={PRICING_CARD_STYLE}>
                  <PricingCardContent plan={plan} />
                </div>
              )}
            </ScaleIn>
          ))}
        </div>
      </div>
    </section>
  );
}

function PricingCardContent({ plan }: { plan: typeof plans[0] }) {
  return (
    <>
      <h3 className="text-[36px] md:text-[48px] font-normal tracking-[-0.05em] text-[rgb(61,61,61)] mb-1 leading-[1.2]" style={{ fontFamily: "var(--font-heading)" }}>
        {plan.name}
      </h3>
      <div className="flex items-baseline gap-2 mb-3">
        <span className="text-[36px] md:text-[44px] font-medium text-[rgb(61,61,61)] leading-none" style={{ fontFamily: "var(--font-stat)" }}>{plan.price}</span>
        <span className="text-[14px] text-[rgb(153,153,153)]" style={{ fontFamily: "var(--font-body)" }}>AED / per thermostat</span>
      </div>
      <p className="text-[16px] text-[rgb(109,109,109)] mb-6 leading-[1.4]" style={{ fontFamily: "var(--font-body)" }}>{plan.tagline}</p>
      <Link href={`/book?plan=${plan.name.toLowerCase()}`} className="w-full flex items-center justify-center px-6 py-3.5 text-[16px] text-white leading-[150%] hover:brightness-110 transition-all duration-200 mb-7" style={PRICING_BTN_STYLE}>
        {plan.cta}
      </Link>
      <ul className="space-y-3">
        {plan.features.map((f) => (
          <li key={f} className="flex items-start gap-3">
            <CheckIcon />
            <span className="text-[14px] text-[rgb(109,109,109)] leading-[1.5]" style={{ fontFamily: "var(--font-body)" }}>{f}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

/* ─── Testimonials ───────────────────────────────────────────────────────── */

const t1 = [
  { name: "Alex Carter", title: "Marketing Director, NexGen Solutions", text: "After Ductly cleaned our vents, my morning allergies completely vanished. The technicians were friendly, professional, and very thorough. It was worth every single penny.", img: "/images/testimonial-1.jpeg" },
  { name: "Priya Mehta", title: "Product Manager, Stellar Apps", text: "Our energy bills dropped noticeably after we hired Ductly to clean our HVAC system. The airflow is stronger, and the house feels perfectly balanced.", img: "/images/testimonial-2.jpeg" },
  { name: "Marcus Reed", title: "CTO, TechVault", text: "Fast, affordable, and incredibly professional service. You don't realize how dirty your air ducts are until Ductly cleans them out. Absolute five-star experience!", img: "/images/testimonial-3.jpeg" },
  { name: "Sophie Yang", title: "UX Designer, FlowStudio", text: "Our house smells amazingly fresh now. The technicians were polite, wore shoe covers, and respected our space. I will definitely use Ductly again next year.", img: "/images/testimonial-4.jpeg" },
  { name: "Daniel Kwon", title: "Founder, ElevateHQ", text: "My air conditioner cools the house much faster since getting the ducts cleaned. Ductly was prompt, efficient, and super friendly. We are extremely happy customers.", img: "/images/testimonial-5.jpeg" },
];

const t2 = [
  { name: "Elena Petrova", title: "Head of Growth, DataPulse", text: "The team at Ductly was fantastic. They worked quickly and left my home completely spotless. The air feels much fresher now. I highly recommend them!", img: "/images/testimonial-6.jpeg" },
  { name: "Jamal Williams", title: "CEO, SwiftScale", text: "I was shocked by the before and after photos of our ductwork. Ductly did an incredible job removing years of dust. Breathing is easier now!", img: "/images/testimonial-7.jpeg" },
  { name: "Lina Costa", title: "Creative Director, BrightLabs", text: "Moving into a home with previous pets was tough on my asthma. Ductly cleared out all the lingering dog hair and dander. Absolutely lifesavers!", img: "/images/testimonial-8.jpeg" },
  { name: "Ryan Park", title: "VP Sales, CloudForge", text: "The customer service was phenomenal from start to finish. Ductly explained the entire process clearly with zero hidden fees. I am completely satisfied with their work.", img: "/images/testimonial-9.jpeg" },
];

function TCard({ t }: { t: typeof t1[0] }) {
  return (
    <div className="w-[360px] shrink-0 mx-2.5 rounded-[16px] p-6 flex flex-col" style={{ backgroundColor: "rgb(250,250,250)", border: "1px solid rgb(244,244,244)" }}>
      <p className="text-[16px] text-[rgb(109,109,109)] leading-[1.5] mb-5 flex-1" style={{ fontFamily: "var(--font-body)" }}>
        &ldquo;{t.text}&rdquo;
      </p>
      <div className="flex items-center gap-3">
        <div className="relative w-[40px] h-[40px] rounded-full overflow-hidden shrink-0">
          <Image src={t.img} alt={t.name} fill className="object-cover" sizes="40px" />
        </div>
        <div>
          <p className="text-[14px] font-medium text-black leading-tight" style={{ fontFamily: "var(--font-body)" }}>{t.name}</p>
          <p className="text-[12px] text-[rgb(153,153,153)] leading-tight" style={{ fontFamily: "var(--font-body)" }}>{t.title}</p>
        </div>
      </div>
    </div>
  );
}

function TestimonialsSection() {
  return (
    <section className="py-16 overflow-hidden">
      <div className="mx-auto max-w-[1300px] px-6 lg:px-[80px] mb-10">
        <FadeUp delay={0.1}>
          <h2 className="text-[32px] md:text-[48px] font-normal leading-[1.2] tracking-[-0.05em] text-[rgb(61,61,61)] text-center" style={{ fontFamily: "var(--font-heading)" }}>
            Real Stories, Real Results
          </h2>
        </FadeUp>
      </div>

      {/* Row 1 — left */}
      <div className="mb-5 marquee-mask">
        <div className="flex animate-marquee-left" style={{ width: "300%" }}>
          {[0, 1, 2].map((s) => (
            <div key={s} className="flex shrink-0" style={{ width: "33.33%" }}>
              {t1.map((t) => <TCard key={`${s}-${t.name}`} t={t} />)}
            </div>
          ))}
        </div>
      </div>

      {/* Row 2 — right */}
      <div className="marquee-mask">
        <div className="flex animate-marquee-right" style={{ width: "300%" }}>
          {[0, 1, 2].map((s) => (
            <div key={s} className="flex shrink-0" style={{ width: "33.33%" }}>
              {t2.map((t) => <TCard key={`${s}-${t.name}`} t={t} />)}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Stats ──────────────────────────────────────────────────────────────── */

function StatsSection() {
  return (
    <section className="py-20">
      <div className="mx-auto max-w-[1300px] px-6 lg:px-[80px]">
        <div className="flex flex-col md:flex-row items-center justify-center gap-16 md:gap-24">
          <FadeUp className="text-center">
            <div className="text-[48px] md:text-[64px] font-medium text-[rgb(61,61,61)] leading-none" style={{ fontFamily: "var(--font-stat)" }}>99.7%</div>
            <p className="mt-2 text-[16px] text-[rgb(109,109,109)]" style={{ fontFamily: "var(--font-body)" }}>Air purity post cleaning</p>
          </FadeUp>
          <div className="hidden md:block w-px h-16 bg-[rgb(244,244,244)]" />
          <FadeUp delay={0.15} className="text-center">
            <div className="text-[48px] md:text-[64px] font-medium text-[rgb(61,61,61)] leading-none" style={{ fontFamily: "var(--font-stat)" }}>100+</div>
            <p className="mt-2 text-[16px] text-[rgb(109,109,109)]" style={{ fontFamily: "var(--font-body)" }}>HVAC units cleaned</p>
          </FadeUp>
        </div>
      </div>
    </section>
  );
}

/* ─── FAQ ─────────────────────────────────────────────────────────────────── */

const faqs = [
  { q: "How much does your cleaning service cost?", a: "Our pricing starts at 349 AED per thermostat for the Essential plan. We offer three tiers - Essential, Signature, and Elite - to match your needs and budget. Contact us for a personalized quote." },
  { q: "Do you offer a free cleaning services estimate?", a: "Yes, we provide free estimates for all residential and commercial properties. Our team will assess your HVAC system and provide a detailed quote with no obligation." },
  { q: "How long will Ac duct cleaning take?", a: "A typical residential cleaning takes 90 minutes. Larger properties or commercial spaces may take 2-4 hours depending on the number of units and complexity of the ductwork." },
  { q: "Can duct cleaning reduce electricity bills?", a: "Absolutely. A clean HVAC system operates more efficiently, which can reduce your energy consumption by 15-25%. Most customers notice a difference in their first bill after cleaning." },
  { q: "Do you provide AC duct cleaning for offices and retail spaces?", a: "Yes, we serve all commercial properties including offices, retail stores, restaurants, and warehouses. We offer flexible scheduling to minimize disruption to your business operations." },
];

function FAQSection() {
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  return (
    <section id="faq" className="py-16" aria-labelledby="faq-heading">
      <div className="mx-auto max-w-[800px] px-6">
        <FadeUp delay={0.1}>
          <h2 id="faq-heading" className="text-[32px] md:text-[48px] font-normal leading-[1.2] tracking-[-0.05em] text-[rgb(61,61,61)] text-center mb-12" style={{ fontFamily: "var(--font-heading)" }}>
            All You Need to Know
          </h2>
        </FadeUp>

        <div role="list">
          {faqs.map((faq, i) => (
            <div key={i} className="border-b border-[rgb(244,244,244)]" role="listitem">
              <button type="button" onClick={() => setOpenIdx(openIdx === i ? null : i)} className="w-full flex items-center justify-between py-5 text-left gap-4" aria-expanded={openIdx === i ? "true" : "false"} aria-controls={`faq-answer-${i}`}>
                <span className="text-[16px] md:text-[18px] text-[rgb(61,61,61)] font-normal" style={{ fontFamily: "var(--font-body)" }}>{faq.q}</span>
                <span className="text-[22px] text-[rgb(153,153,153)] shrink-0 transition-transform duration-200" aria-hidden="true" style={{ transform: openIdx === i ? "rotate(45deg)" : "none" }}>+</span>
              </button>
              <div id={`faq-answer-${i}`} className={`faq-answer ${openIdx === i ? "open" : ""}`} role="region" aria-labelledby={`faq-q-${i}`}>
                <div>
                  <p className="pb-5 text-[16px] text-[rgb(109,109,109)] leading-[1.5] max-w-[650px]" style={{ fontFamily: "var(--font-body)" }}>{faq.a}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Contact ────────────────────────────────────────────────────────────── */

function ContactSection() {
  const [submitted, setSubmitted] = useState(false);
  const [contactError, setContactError] = useState("");
  const [contactLoading, setContactLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const name = data.get("name") as string;
    const email = data.get("email") as string;
    const topic = data.get("topic") as string;
    const message = data.get("message") as string;
    if (!name?.trim() || !email?.trim()) return;

    setContactLoading(true);
    setContactError("");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, topic, message }),
      });
      if (!res.ok) {
        const d = await res.json();
        setContactError(d.error || "Failed to submit.");
        return;
      }
      setSubmitted(true);
      form.reset();
    } catch {
      setContactError("Network error. Please try again.");
    } finally {
      setContactLoading(false);
    }
  }

  return (
    <section id="contact" className="py-16" aria-labelledby="contact-heading">
      <div className="mx-auto max-w-[600px] px-6">
        <FadeUp delay={0.1}>
          <h2 id="contact-heading" className="text-[32px] md:text-[48px] font-normal leading-[1.2] tracking-[-0.05em] text-[rgb(61,61,61)] text-center mb-10" style={{ fontFamily: "var(--font-heading)" }}>
            Get in Touch
          </h2>
        </FadeUp>

        <FadeUp delay={0.2}>
          {submitted ? (
            <div className="text-center py-12">
              <p className="text-[20px] text-[rgb(61,61,61)] mb-2" style={{ fontFamily: "var(--font-heading)" }}>Thank you!</p>
              <p className="text-[16px] text-[rgb(109,109,109)]" style={{ fontFamily: "var(--font-body)" }}>We&apos;ll get back to you shortly.</p>
              <button type="button" onClick={() => setSubmitted(false)} className="mt-4 text-[14px] text-[rgb(149,207,140)] underline" style={{ fontFamily: "var(--font-body)" }}>Send another message</button>
            </div>
          ) : (
            <>
              <form className="space-y-4" onSubmit={handleSubmit}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <input type="text" name="name" placeholder="Name" required aria-label="Your name" className="w-full rounded-[10px] border border-[rgb(244,244,244)] bg-[rgb(250,250,250)] px-4 py-3 text-[16px] text-[rgb(61,61,61)] placeholder:text-[rgb(153,153,153)] focus:outline-none focus:border-[rgb(149,207,140)] transition-colors" style={{ fontFamily: "var(--font-body)" }} />
                  <input type="email" name="email" placeholder="Email" required aria-label="Your email" className="w-full rounded-[10px] border border-[rgb(244,244,244)] bg-[rgb(250,250,250)] px-4 py-3 text-[16px] text-[rgb(61,61,61)] placeholder:text-[rgb(153,153,153)] focus:outline-none focus:border-[rgb(149,207,140)] transition-colors" style={{ fontFamily: "var(--font-body)" }} />
                </div>
                <select name="topic" aria-label="Select a topic" className="w-full rounded-[10px] border border-[rgb(244,244,244)] bg-[rgb(250,250,250)] px-4 py-3 text-[16px] text-[rgb(153,153,153)] focus:outline-none focus:border-[rgb(149,207,140)] transition-colors appearance-none" style={{ fontFamily: "var(--font-body)" }} defaultValue="">
                  <option value="" disabled>Select a topic...</option>
                  <option value="support">Customer Support</option>
                  <option value="plan">Plan Inquiry</option>
                </select>
                <textarea name="message" placeholder="Message" rows={5} aria-label="Your message" className="w-full rounded-[10px] border border-[rgb(244,244,244)] bg-[rgb(250,250,250)] px-4 py-3 text-[16px] text-[rgb(61,61,61)] placeholder:text-[rgb(153,153,153)] focus:outline-none focus:border-[rgb(149,207,140)] transition-colors resize-none" style={{ fontFamily: "var(--font-body)" }} />
                {contactError && <p className="text-[14px] text-[rgb(220,80,80)]" style={{ fontFamily: "var(--font-body)" }}>{contactError}</p>}
                <button type="submit" disabled={contactLoading} className="w-full flex items-center justify-center px-6 py-3.5 text-[16px] text-white leading-[150%] hover:brightness-110 transition-all duration-200 disabled:opacity-50" style={{ background: "linear-gradient(135deg, rgb(0,0,0) 0%, rgb(109,109,109) 100%)", borderRadius: 40, boxShadow: "0px 4px 8px 0px rgba(0,0,0,0.15)", fontFamily: "var(--font-cta)", fontWeight: 500, letterSpacing: "-0.02em" }}>
                  {contactLoading ? "Submitting..." : "Submit"}
                </button>
              </form>
              <p className="text-center text-[14px] text-[rgb(153,153,153)] mt-6" style={{ fontFamily: "var(--font-body)" }}>
                Contact us at info@ductly.ae
              </p>
            </>
          )}
        </FadeUp>
      </div>
    </section>
  );
}

/* ─── Footer ─────────────────────────────────────────────────────────────── */

function Footer() {
  const [subEmail, setSubEmail] = useState("");
  const [subDone, setSubDone] = useState(false);
  const [subLoading, setSubLoading] = useState(false);

  async function handleSubscribe(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!subEmail.trim()) return;
    setSubLoading(true);
    try {
      await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: subEmail }),
      });
      setSubDone(true);
      setSubEmail("");
    } catch { /* silently fail */ }
    setSubLoading(false);
  }

  return (
    <footer className="border-t border-[rgb(244,244,244)] py-12" role="contentinfo">
      <div className="mx-auto max-w-[1300px] px-6 lg:px-[80px]">
        <div className="flex flex-col md:flex-row justify-between gap-10">
          <div>
            <p className="text-[16px] text-[rgb(153,153,153)] mb-1" style={{ fontFamily: "var(--font-body)" }}>Contact us at</p>
            <a href="mailto:info@ductly.ae" className="text-[18px] font-medium text-black hover:opacity-70 transition-opacity" style={{ fontFamily: "var(--font-body)" }}>info@ductly.ae</a>
            <form onSubmit={handleSubscribe} className="mt-6 flex items-center bg-white rounded-full border border-[rgb(244,244,244)] overflow-hidden pl-5 pr-1.5 py-1.5" style={{ boxShadow: "0px 2px 8px rgba(0,0,0,0.06)" }}>
              <input type="email" value={subEmail} onChange={(e) => setSubEmail(e.target.value)} placeholder="name@email.com" required aria-label="Email for newsletter" className="text-[14px] text-[rgb(109,109,109)] bg-transparent outline-none flex-1 min-w-[180px]" style={{ fontFamily: "var(--font-body)" }} />
              <button type="submit" disabled={subLoading} className="px-5 py-2.5 rounded-full text-[14px] text-white flex-shrink-0 disabled:opacity-50" style={{ background: "linear-gradient(135deg, rgb(147,216,216) 0%, rgb(149,207,140) 100%)", fontFamily: "var(--font-cta)", fontWeight: 500 }}>{subLoading ? "..." : "Subscribe"}</button>
            </form>
            {subDone && <p className="mt-2 text-[13px] text-[rgb(149,207,140)]" style={{ fontFamily: "var(--font-body)" }}>Thanks! You&apos;re subscribed.</p>}
          </div>

          <nav className="flex gap-16" aria-label="Footer navigation">
            <div>
              <h4 className="text-[14px] font-medium text-[rgb(153,153,153)] mb-3" style={{ fontFamily: "var(--font-body)" }}>Site</h4>
              <ul className="space-y-2">
                {[
                  { label: "Home", href: "/" },
                  { label: "Pricing", href: "#pricing" },
                  { label: "Features", href: "#feature" },
                  { label: "Contact", href: "#contact" },
                ].map((link) => (
                  <li key={link.label}>
                    <a href={link.href} className="text-[14px] text-[rgb(61,61,61)] hover:text-black transition-colors" style={{ fontFamily: "var(--font-body)" }}>{link.label}</a>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h4 className="text-[14px] font-medium text-[rgb(153,153,153)] mb-3" style={{ fontFamily: "var(--font-body)" }}>Resources</h4>
              <ul className="space-y-2">
                {[
                  { label: "FAQ", href: "#faq" },
                  { label: "Terms", href: "/terms" },
                  { label: "Privacy Policy", href: "/privacy" },
                ].map((link) => (
                  <li key={link.label}>
                    <a href={link.href} className="text-[14px] text-[rgb(61,61,61)] hover:text-black transition-colors" style={{ fontFamily: "var(--font-body)" }}>{link.label}</a>
                  </li>
                ))}
              </ul>
            </div>
          </nav>
        </div>

        <div className="mt-10 pt-6 border-t border-[rgb(244,244,244)]">
          <p className="text-[12px] text-[rgb(153,153,153)]" style={{ fontFamily: "var(--font-body)" }}>
            Designed by TerraFlow.Studio
          </p>
        </div>
      </div>
    </footer>
  );
}

/* ─── Page ────────────────────────────────────────────────────────────────── */

export default function Home() {
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:bg-white focus:text-black focus:rounded-lg focus:shadow-lg focus:text-[14px]" style={{ fontFamily: "var(--font-body)" }}>Skip to content</a>
      <Navbar />
      <main id="main">
        <HeroSection />
        {/* "Trusted by the leaders" logo marquee hidden for now (placeholder logos). Re-enable when real partner logos are ready. */}
        {/* <LogoMarquee /> */}
        <FeaturesSection />
        <ProcessSection />
        <PricingSection />
        <TestimonialsSection />
        <StatsSection />
        <FAQSection />
        <ContactSection />
      </main>
      <Footer />
      <ChatWidget />
    </>
  );
}
