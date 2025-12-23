"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState<"signup" | "login" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function onSignUp() {
    setMessage(null);
    setLoading("signup");
    try {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;
      setMessage(
        "Sign up successful. Check your email to confirm (if required)."
      );
    } catch (e: any) {
      setMessage(e?.message ?? "Sign up failed.");
    } finally {
      setLoading(null);
    }
  }

  async function onLogIn() {
    setMessage(null);
    setLoading("login");
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
      router.replace("/");
    } catch (e: any) {
      setMessage(e?.message ?? "Log in failed.");
    } finally {
      setLoading(null);
    }
  }

  return (
    <main style={{ maxWidth: 520, margin: "48px auto", padding: 16 }}>
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 16 }}>Login</h1>

      <div
        style={{
          display: "grid",
          gap: 12,
          padding: 16,
          borderRadius: 12,
          border: "1px solid var(--card-border)",
          background: "var(--card-bg)",
        }}
      >
        <label style={{ display: "block" }}>
          <div style={{ marginBottom: 6, opacity: 0.85 }}>Email</div>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            style={{
              width: "100%",
              padding: 10,
              borderRadius: 8,
              border: "1px solid var(--control-border)",
              background: "var(--control-bg)",
              color: "var(--foreground)",
            }}
          />
        </label>

        <label style={{ display: "block" }}>
          <div style={{ marginBottom: 6, opacity: 0.85 }}>Password</div>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            style={{
              width: "100%",
              padding: 10,
              borderRadius: 8,
              border: "1px solid var(--control-border)",
              background: "var(--control-bg)",
              color: "var(--foreground)",
            }}
          />
        </label>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={onSignUp}
            disabled={loading !== null || !email || !password}
            style={{
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid var(--control-border)",
              background:
                loading === null && email && password
                  ? "var(--button-bg)"
                  : "var(--control-bg)",
              color:
                loading === null && email && password
                  ? "var(--button-text)"
                  : "var(--foreground)",
              cursor:
                loading !== null || !email || !password
                  ? "not-allowed"
                  : "pointer",
            }}
          >
            {loading === "signup" ? "Signing up..." : "Sign up"}
          </button>

          <button
            type="button"
            onClick={onLogIn}
            disabled={loading !== null || !email || !password}
            style={{
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid var(--control-border)",
              background:
                loading === null && email && password
                  ? "var(--button-bg)"
                  : "var(--control-bg)",
              color:
                loading === null && email && password
                  ? "var(--button-text)"
                  : "var(--foreground)",
              cursor:
                loading !== null || !email || !password
                  ? "not-allowed"
                  : "pointer",
            }}
          >
            {loading === "login" ? "Logging in..." : "Log in"}
          </button>
        </div>

        {message ? <p style={{ marginTop: 4 }}>{message}</p> : null}
      </div>
    </main>
  );
}
