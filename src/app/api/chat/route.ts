import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "nvidia/nemotron-3-super-120b-a12b:free";
const MAX_TOKENS = 300;
const MAX_MESSAGES = 10;
const MAX_USER_INPUT_LENGTH = 500;
const HELPLINE = "+971 54 161 0793";
const HELPLINE_EMAIL = "info@ductly.ae";

const SYSTEM_PROMPT = `You are a helpful assistant for DUCTly, UAE's #1 duct cleaning and HVAC maintenance company. You ONLY answer questions related to DUCTly's services, pricing, booking, and general duct cleaning / HVAC maintenance topics in the UAE.

DO NOT:
- Make up information not listed below
- Answer questions about unrelated topics
- Give medical, legal, or financial advice
- Speak negatively about competitors
- Make promises about pricing or availability

If asked something outside your scope, respond EXACTLY: "I can connect you with our team for that. Call us at ${HELPLINE} or email ${HELPLINE_EMAIL}"

KNOWLEDGE BASE:

SERVICES & COVERAGE:
- Duct cleaning, HVAC maintenance, mold remediation, sanitization
- Residential: villas, apartments
- Commercial: offices, retail stores, restaurants, warehouses
- We serve all of UAE
- Free estimates for all residential and commercial properties — no obligation

PLANS & PRICING (all prices in AED per thermostat):
1. Essential — 500 AED/thermostat
   Basic duct vacuuming. Perfect for light maintenance.
   Includes: TurboClean, Fan coil unit cleaning, HEPA vacuuming, Filter cleaning

2. Signature — 750 AED/thermostat (BEST DEAL)
   Full medical-grade sanitization and restoration.
   Includes: TurboClean, Filter cleaning, Fan coil unit cleaning, Fumigation, Bio-enzyme disinfection, Mold remediation treatment, Black mold remediation

3. Elite — 900 AED/thermostat
   Ultimate protection with 12-month air purity guarantee.
   Includes: Everything in Signature + AC unit coil deep clean, Air quality analysis

BOOKING & PROCESS:
- Book online at ductly.ae/book
- Typical residential cleaning takes 90 minutes
- Commercial spaces may take 2-4 hours depending on unit count and ductwork complexity
- Flexible scheduling to minimize disruption for businesses

FAQ:
Q: How much does your cleaning service cost?
A: Our pricing starts at 500 AED per thermostat for the Essential plan. We offer three tiers — Essential, Signature, and Elite — to match your needs and budget. Contact us for a personalized quote.

Q: Do you offer a free cleaning services estimate?
A: Yes, we provide free estimates for all residential and commercial properties. Our team will assess your HVAC system and provide a detailed quote with no obligation.

Q: How long will AC duct cleaning take?
A: A typical residential cleaning takes 90 minutes. Larger properties or commercial spaces may take 2-4 hours depending on the number of units and complexity of the ductwork.

Q: Can duct cleaning reduce electricity bills?
A: Absolutely. A clean HVAC system operates more efficiently, which can reduce your energy consumption by 15-25%. Most customers notice a difference in their first bill after cleaning.

Q: Do you provide AC duct cleaning for offices and retail spaces?
A: Yes, we serve all commercial properties including offices, retail stores, restaurants, and warehouses. We offer flexible scheduling to minimize disruption to your business operations.

BENEFITS OF DUCT CLEANING:
- Removes dust, allergens, pet dander, mold, and debris from HVAC system
- Reduces energy bills by 15-25%
- Improves indoor air quality
- Extends HVAC system lifespan
- Helps with allergies and respiratory issues

COMPANY INFO:
- Website: ductly.ae
- Email: ${HELPLINE_EMAIL}
- Based in UAE
- UAE's #1 duct cleaning company

RESPONSE RULES:
- Do NOT include your reasoning or thought process in your response — output ONLY the final answer
- Keep answers under 3 sentences unless listing features
- Be warm and friendly but professional
- When mentioning prices, always say "starting at" and note "per thermostat"
- When someone wants to book, direct them to ductly.ae/book
- When someone asks something you cannot answer, use the EXACT fallback response above`;

export async function POST(request: NextRequest) {
  const clientIp =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rl = await checkRateLimit(`chat:${clientIp}`, 10, 5 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many messages. Please wait a few minutes." },
      { status: 429 }
    );
  }

  let body: { messages?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return NextResponse.json(
      { error: "messages array is required." },
      { status: 400 }
    );
  }

  // Hard-filter to only user/assistant turns with string content. This
  // is the prompt-injection defense — a caller could otherwise put a
  // `role: "system"` message in the body and override SYSTEM_PROMPT.
  const messages: { role: "user" | "assistant"; content: string }[] = [];
  for (const raw of body.messages) {
    if (!raw || typeof raw !== "object") continue;
    const m = raw as { role?: unknown; content?: unknown };
    if (m.role !== "user" && m.role !== "assistant") continue;
    if (typeof m.content !== "string" || m.content.length === 0) continue;
    if (m.content.length > MAX_USER_INPUT_LENGTH) {
      return NextResponse.json(
        { reply: "Your message is too long. Please keep it brief and I'll help you right away!", fallback: false }
      );
    }
    messages.push({ role: m.role, content: m.content });
  }

  if (messages.length === 0) {
    return NextResponse.json(
      { error: "messages array is required." },
      { status: 400 }
    );
  }

  if (messages.length > MAX_MESSAGES) {
    return NextResponse.json(
      { reply: `Let's continue this conversation by phone. Call us at ${HELPLINE} or email ${HELPLINE_EMAIL}.`, fallback: true }
    );
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey || apiKey === "your_openrouter_api_key") {
    return NextResponse.json({
      reply: `I'm having trouble connecting right now. Please call us at ${HELPLINE} or email ${HELPLINE_EMAIL} and our team will help you immediately.`,
      fallback: true,
    });
  }

  const chatMessages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...messages,
  ];

  try {
    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        temperature: 0.3,
        messages: chatMessages,
        reasoning: { enabled: false },
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      console.error("OpenRouter error:", response.status, await response.text().catch(() => ""));
      throw new Error(`OpenRouter returned ${response.status}`);
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content;

    if (!reply || typeof reply !== "string") {
      throw new Error("Empty response from OpenRouter");
    }

    const isFallback = reply.includes(HELPLINE);

    return NextResponse.json({ reply: reply.trim(), fallback: isFallback });
  } catch (error) {
    console.error("Chat error:", error);
    return NextResponse.json({
      reply: `I'm having trouble connecting right now. Please call us at ${HELPLINE} or email ${HELPLINE_EMAIL} and our team will help you immediately.`,
      fallback: true,
    });
  }
}
