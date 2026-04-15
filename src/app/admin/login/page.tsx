"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

export default function AdminLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/admin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Login failed.");
        return;
      }

      // Store token in cookie via response, then redirect
      router.push("/admin");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-6"
      style={{ background: "rgb(247,248,250)" }}
    >
      <div
        className="w-full max-w-[400px] p-8"
        style={{
          background: "white",
          border: "2px solid rgb(238,240,244)",
          borderRadius: 20,
        }}
      >
        <div className="flex justify-center mb-6">
          <Image
            src="/images/logo.png"
            alt="DUCTly"
            width={140}
            height={44}
            className="h-[44px] w-auto object-contain"
          />
        </div>

        <h1
          className="text-[22px] font-normal tracking-[-0.03em] text-center mb-1"
          style={{ fontFamily: "var(--font-heading)", color: "rgb(61,61,61)" }}
        >
          Admin Login
        </h1>
        <p
          className="text-[14px] text-center mb-6"
          style={{ fontFamily: "var(--font-body)", color: "rgb(160,165,175)" }}
        >
          Sign in to access the dashboard
        </p>

        {error && (
          <div
            className="mb-4 rounded-[10px] p-3 text-[13px]"
            style={{
              background: "rgb(255,245,245)",
              border: "1px solid rgb(255,200,200)",
              color: "rgb(180,60,60)",
              fontFamily: "var(--font-body)",
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label
              className="block text-[13px] font-medium mb-1.5"
              style={{ fontFamily: "var(--font-body)", color: "rgb(130,135,145)" }}
            >
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              className="w-full px-4 py-3 text-[14px] rounded-[10px] outline-none transition-colors"
              style={{
                fontFamily: "var(--font-body)",
                border: "2px solid rgb(238,240,244)",
                color: "rgb(61,61,61)",
              }}
              placeholder="admin@ductly.ae"
            />
          </div>
          <div>
            <label
              className="block text-[13px] font-medium mb-1.5"
              style={{ fontFamily: "var(--font-body)", color: "rgb(130,135,145)" }}
            >
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-4 py-3 text-[14px] rounded-[10px] outline-none transition-colors"
              style={{
                fontFamily: "var(--font-body)",
                border: "2px solid rgb(238,240,244)",
                color: "rgb(61,61,61)",
              }}
              placeholder="Enter password"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 text-[14px] font-medium text-white transition-all hover:brightness-110 disabled:opacity-50"
            style={{
              background: "linear-gradient(135deg, rgb(147,216,216), rgb(149,207,140))",
              borderRadius: 10,
              fontFamily: "var(--font-cta)",
            }}
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
