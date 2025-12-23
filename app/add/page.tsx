"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type SubmitState = "idle" | "uploading" | "processing";

export default function AddPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<SubmitState>("idle");
  const [message, setMessage] = useState<string | null>(null);

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

      setUserId(user.id);
      setReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  const monthPrefix = useMemo(() => {
    const iso = new Date().toISOString();
    return iso.slice(0, 7); // yyyy-mm
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    if (!file) {
      setMessage("Choose an image first.");
      return;
    }

    if (!userId) {
      setMessage("Not signed in.");
      return;
    }

    const bucket = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET;
    if (!bucket) {
      setMessage(
        "Missing NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET env var (Supabase Storage bucket name)."
      );
      return;
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-");
    const uniquePrefix = uuidLike();
    const imagePath = `${userId}/${monthPrefix}/${uniquePrefix}-${safeName}`;

    setStatus("uploading");

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(imagePath, file, {
        contentType: file.type || "image/jpeg",
        upsert: false,
      });

    if (uploadError) {
      setStatus("idle");
      setMessage(uploadError.message);
      return;
    }

    setStatus("processing");

    const {
      data: { session },
    } = await supabase.auth.getSession();

    const accessToken = session?.access_token;
    if (!accessToken) {
      setStatus("idle");
      setMessage("Session expired. Please log in again.");
      router.replace("/login");
      return;
    }

    // If fetch errors (network/timeout), ensure we still reset UI state.
    try {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 60_000);

      const res = await fetch("/api/process", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ imagePath, sourceType: "receipt" }),
        signal: controller.signal,
      });

      window.clearTimeout(timeoutId);

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        setMessage(text || `Process failed (${res.status}).`);
        return;
      }

      router.replace("/transactions");
      setFile(null);
    } catch (err: any) {
      const msg =
        err?.name === "AbortError"
          ? "Processing timed out."
          : err?.message ?? "Processing failed.";
      setMessage(msg);
    } finally {
      setStatus("idle");
    }
  }

  function uuidLike(): string {
    // Prefer native randomUUID if available
    const c = globalThis.crypto as Crypto | undefined;
    if (c && "randomUUID" in c && typeof (c as any).randomUUID === "function") {
      return (c as any).randomUUID();
    }

    // Fallback: RFC4122-ish v4 using getRandomValues
    if (!c?.getRandomValues) {
      // last-resort fallback (still unique enough for filenames)
      return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }

    const bytes = new Uint8Array(16);
    c.getRandomValues(bytes);

    // Set version (4) and variant (10)
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(
      12,
      16
    )}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  if (!ready) return null;

  return (
    <main style={{ maxWidth: 520, margin: "48px auto", padding: 16 }}>
      <div
        style={{ display: "flex", justifyContent: "space-between", gap: 12 }}
      >
        <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 16 }}>
          Add Receipt
        </h1>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/" style={{ padding: "10px 12px" }}>
            Home
          </Link>
          <Link href="/transactions" style={{ padding: "10px 12px" }}>
            Transactions
          </Link>
        </div>
      </div>

      <form
        onSubmit={onSubmit}
        style={{
          display: "grid",
          gap: 12,
          padding: 16,
          borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.15)",
          background: "rgba(255,255,255,0.06)",
          color: "#fff",
        }}
      >
        <input
          type="file"
          accept="image/*"
          //   capture="environment"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          style={{
            padding: 10,
            borderRadius: 8,
            border: "1px solid rgba(255,255,255,0.25)",
            background: "rgba(0,0,0,0.35)",
            color: "#fff",
          }}
        />

        <button
          type="submit"
          disabled={!file || status !== "idle"}
          style={{
            padding: "10px 12px",
            width: "fit-content",
            borderRadius: 8,
            border: "1px solid rgba(255,255,255,0.25)",
            background: status === "idle" ? "#fff" : "rgba(255,255,255,0.6)",
            color: "#000",
            cursor: !file || status !== "idle" ? "not-allowed" : "pointer",
          }}
        >
          {status === "uploading"
            ? "Uploading..."
            : status === "processing"
            ? "Processing..."
            : "Submit"}
        </button>

        {message ? (
          <p style={{ marginTop: 4, color: "#fff" }}>{message}</p>
        ) : null}
      </form>
    </main>
  );
}
