"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

export default function Home() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (cancelled) return;

      if (!user) {
        router.replace("/login");
        return;
      }

      setEmail(user.email ?? null);
      setReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!ready) return null;

  async function onSignOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <main style={{ maxWidth: 520, margin: "48px auto", padding: 16 }}>
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 8 }}>
        Receipt Tracker
      </h1>

      {email ? (
        <p style={{ marginBottom: 16, opacity: 0.8 }}>Signed in as {email}</p>
      ) : null}
      <div style={{ display: "flex", gap: 8 }}>
        <Link
          href="/add"
          style={{
            display: "inline-flex",
            padding: "10px 12px",
            border: "1px solid var(--control-border)",
            borderRadius: 8,
            textDecoration: "none",
            background: "var(--control-bg)",
            color: "var(--foreground)",
          }}
        >
          Add receipt
        </Link>

        <Link
          href="/transactions"
          style={{
            display: "inline-flex",
            padding: "10px 12px",
            border: "1px solid var(--control-border)",
            borderRadius: 8,
            textDecoration: "none",
            background: "var(--control-bg)",
            color: "var(--foreground)",
          }}
        >
          View transactions
        </Link>

        <button
          type="button"
          onClick={onSignOut}
          style={{
            padding: "10px 12px",
            borderRadius: 8,
            border: "1px solid var(--control-border)",
            background: "var(--control-bg)",
            color: "var(--foreground)",
            cursor: "pointer",
          }}
        >
          Sign out
        </button>
      </div>
    </main>
  );
}
