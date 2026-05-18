"use client";

import { useState, useRef, useEffect, useCallback } from "react";

const HELPLINE = "+971 54 161 0793";
const HELPLINE_EMAIL = "info@ductly.ae";
const MAX_MESSAGES = 10;
const MAX_INPUT_LENGTH = 500;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const WELCOME_MSG: ChatMessage = {
  role: "assistant",
  content: "Hi! I'm the DUCTly assistant. Ask me about our services, pricing, or booking.",
};

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MSG]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [fallbackCount, setFallbackCount] = useState(0);
  const [conversationEnded, setConversationEnded] = useState(false);
  const [error, setError] = useState("");

  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const sessionId = useRef(crypto.randomUUID());

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  const sendMessage = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || loading || conversationEnded) return;

    if (trimmed.length > MAX_INPUT_LENGTH) {
      setError("Message too long (max " + MAX_INPUT_LENGTH + " characters)");
      return;
    }

    setError("");
    const userMsg: ChatMessage = { role: "user", content: trimmed };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput("");
    setLoading(true);

    if (updatedMessages.length >= MAX_MESSAGES) {
      const endMsg: ChatMessage = {
        role: "assistant",
        content: "Let's continue this by phone. Call us at " + HELPLINE + " or email " + HELPLINE_EMAIL + ".",
      };
      setMessages((prev) => [...prev, endMsg]);
      setConversationEnded(true);
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Session-Id": sessionId.current,
        },
        body: JSON.stringify({
          messages: updatedMessages.map(function (m) { return { role: m.role, content: m.content }; }),
        }),
      });

      if (res.status === 429) {
        const botMsg: ChatMessage = {
          role: "assistant",
          content: "You've sent too many messages. Please wait a moment and try again.",
        };
        setMessages((prev) => [...prev, botMsg]);
        setLoading(false);
        return;
      }

      const data = await res.json();

      if (data.error) {
        const botMsg: ChatMessage = {
          role: "assistant",
          content: "I ran into an issue. Please call us at " + HELPLINE + " or email " + HELPLINE_EMAIL + ".",
        };
        setMessages((prev) => [...prev, botMsg]);
        setFallbackCount((c) => c + 1);
        setLoading(false);
        return;
      }

      const reply = data.reply || data.error || "Something went wrong.";
      const botMsg: ChatMessage = { role: "assistant", content: reply };
      setMessages((prev) => [...prev, botMsg]);

      if (data.fallback) {
        const newCount = fallbackCount + 1;
        setFallbackCount(newCount);
        if (newCount >= 2) {
          setConversationEnded(true);
        }
      } else {
        setFallbackCount(0);
      }
    } catch {
      const botMsg: ChatMessage = {
        role: "assistant",
        content: "I'm having trouble connecting. Please call us at " + HELPLINE + " or email " + HELPLINE_EMAIL + ".",
      };
      setMessages((prev) => [...prev, botMsg]);
      setFallbackCount((c) => c + 1);
    } finally {
      setLoading(false);
    }
  }, [input, loading, conversationEnded, messages, fallbackCount]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const resetChat = () => {
    setMessages([WELCOME_MSG]);
    setFallbackCount(0);
    setConversationEnded(false);
    setError("");
    setInput("");
    sessionId.current = crypto.randomUUID();
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed z-[9998] flex items-center justify-center transition-transform hover:scale-110 active:scale-95"
        style={{
          bottom: 24,
          right: 24,
          width: 56,
          height: 56,
          borderRadius: "50%",
          background: "linear-gradient(135deg, rgb(147,216,216) 0%, rgb(149,207,140) 100%)",
          boxShadow: "0px 4px 16px rgba(0,0,0,0.18)",
          border: "none",
          display: open ? "none" : "flex",
        }}
        aria-label="Open chat"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
        </svg>
      </button>

      {open && (
        <div
          className="fixed z-[9999] flex flex-col overflow-hidden"
          style={{
            bottom: 88,
            right: 24,
            width: 340,
            height: 460,
            borderRadius: 16,
            background: "white",
            border: "2px solid rgb(244,244,244)",
            boxShadow: "0px 8px 32px rgba(0,0,0,0.16), 0px 2px 8px rgba(0,0,0,0.08)",
          }}
        >
          <div
            className="flex items-center justify-between px-4 py-3 shrink-0"
            style={{
              background: "linear-gradient(135deg, rgb(147,216,216) 0%, rgb(149,207,140) 100%)",
            }}
          >
            <div className="flex items-center gap-2">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
              </svg>
              <span className="text-[15px] font-medium text-white" style={{ fontFamily: "var(--font-cta)" }}>
                DUCTly Assistant
              </span>
            </div>
            <button onClick={() => setOpen(false)} className="text-white hover:opacity-70 transition-opacity" aria-label="Close chat">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3" style={{ background: "rgb(250,250,250)" }}>
            {messages.map((msg, i) => (
              <div key={i} className={"flex " + (msg.role === "user" ? "justify-end" : "justify-start")}>
                <div
                  className="max-w-[85%] px-3.5 py-2.5 text-[14px] leading-[1.5]"
                  style={{
                    borderRadius: 14,
                    fontFamily: "var(--font-body)",
                    background: msg.role === "user" ? "rgb(240,240,240)" : "linear-gradient(135deg, rgb(147,216,216) 0%, rgb(149,207,140) 100%)",
                    color: msg.role === "user" ? "rgb(61,61,61)" : "white",
                    ...(msg.role === "user"
                      ? { borderBottomRightRadius: 4 }
                      : { borderBottomLeftRadius: 4 }),
                  }}
                >
                  {msg.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="px-4 py-3 rounded-[14px]" style={{ background: "linear-gradient(135deg, rgb(147,216,216) 0%, rgb(149,207,140) 100%)", borderBottomLeftRadius: 4 }}>
                  <div className="flex gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-white/60 animate-bounce" style={{ animationDelay: "0ms" }} />
                    <div className="w-2 h-2 rounded-full bg-white/60 animate-bounce" style={{ animationDelay: "150ms" }} />
                    <div className="w-2 h-2 rounded-full bg-white/60 animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            )}
            {fallbackCount >= 2 && (
              <div
                className="rounded-[12px] p-3 text-center"
                style={{
                  background: "rgb(255,252,240)",
                  border: "1px solid rgb(245,225,140)",
                }}
              >
                <p className="text-[13px] text-[rgb(140,110,20)] mb-1" style={{ fontFamily: "var(--font-body)" }}>
                  Let our team help you directly
                </p>
                <p className="text-[15px] font-medium" style={{ fontFamily: "var(--font-body)", color: "rgb(61,61,61)" }}>
                  {HELPLINE}
                </p>
                <p className="text-[12px] text-[rgb(153,153,153)]" style={{ fontFamily: "var(--font-body)" }}>
                  {HELPLINE_EMAIL}
                </p>
              </div>
            )}
            {conversationEnded && (
              <div className="text-center">
                <button
                  onClick={resetChat}
                  className="text-[12px] px-4 py-1.5 rounded-full text-white hover:brightness-110 transition-all"
                  style={{
                    background: "linear-gradient(135deg, rgb(147,216,216) 0%, rgb(149,207,140) 100%)",
                    fontFamily: "var(--font-cta)",
                    fontWeight: 500,
                  }}
                >
                  Start New Chat
                </button>
              </div>
            )}
          </div>

          <div className="shrink-0 px-4 py-3 border-t border-[rgb(244,244,244)]" style={{ background: "white" }}>
            {error && (
              <p className="text-[11px] mb-1.5" style={{ fontFamily: "var(--font-body)", color: "rgb(220,80,80)" }}>
                {error}
              </p>
            )}
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={conversationEnded ? "Chat ended" : "Ask me anything..."}
                disabled={loading || conversationEnded}
                maxLength={MAX_INPUT_LENGTH}
                className="flex-1 rounded-[20px] border-2 border-[rgb(230,230,230)] bg-white px-4 py-2.5 text-[14px] text-[rgb(61,61,61)] placeholder:text-[rgb(185,185,185)] focus:border-[rgb(147,216,216)] focus:outline-none transition-colors disabled:opacity-50"
                style={{ fontFamily: "var(--font-body)" }}
              />
              <button
                onClick={sendMessage}
                disabled={loading || conversationEnded || !input.trim()}
                className="shrink-0 flex items-center justify-center rounded-full transition-all hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  width: 38,
                  height: 38,
                  background: "linear-gradient(135deg, rgb(147,216,216) 0%, rgb(149,207,140) 100%)",
                  border: "none",
                }}
                aria-label="Send message"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
