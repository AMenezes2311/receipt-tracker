"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Transaction = {
  id: string;
  created_at: string;
  txn_date: string | null;
  merchant: string | null;
  total_cents: number | null;
  currency: string | null;
  category: string | null;
  source_type: string | null;
  image_path: string | null;
  confidence: number | null;
  ai_json: unknown;
};

type TransactionDraft = {
  merchant: string;
  txn_date: string;
  amount: string;
  currency: string;
  category: string;
};

function formatMoney(totalCents: number | null, currency: string | null) {
  if (typeof totalCents !== "number") return "—";
  const amount = totalCents / 100;
  const cur = currency ?? "CAD";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: cur,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${cur}`;
  }
}

function centsToAmountString(totalCents: number | null) {
  if (typeof totalCents !== "number") return "";
  return (totalCents / 100).toFixed(2);
}

function amountStringToCents(amount: string): number | null {
  const trimmed = amount.trim();
  if (!trimmed.length) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return null;
  const cents = Math.round(n * 100);
  if (cents < 0) return null;
  return cents;
}

function toDraft(t: Transaction): TransactionDraft {
  return {
    merchant: t.merchant ?? "",
    txn_date: t.txn_date ?? "",
    amount: centsToAmountString(t.total_cents),
    currency: (t.currency ?? "CAD").toUpperCase(),
    category: t.category ?? "",
  };
}

export default function TransactionsPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [rows, setRows] = useState<Transaction[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [imageModal, setImageModal] = useState<{
    open: boolean;
    url: string | null;
    loading: boolean;
    error: string | null;
  }>({ open: false, url: null, loading: false, error: null });
  const [deletingIds, setDeletingIds] = useState<Record<string, boolean>>({});
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragDx, setDragDx] = useState<Record<string, number>>({});
  const [hasDragged, setHasDragged] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<TransactionDraft | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const user = session?.user;

      if (cancelled) return;

      if (!user || !session?.access_token) {
        router.replace("/login");
        return;
      }

      setAccessToken(session.access_token);
      setReady(true);

      const res = await fetch("/api/transactions", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!res.ok) {
        if (res.status === 401) {
          router.replace("/login");
          return;
        }
        const text = await res.text().catch(() => "");
        setError(text || `Failed to load (${res.status}).`);
        return;
      }

      const json = (await res.json().catch(() => null)) as any;
      setRows(Array.isArray(json?.transactions) ? json.transactions : []);
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (!imageModal.open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setImageModal({ open: false, url: null, loading: false, error: null });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [imageModal.open]);

  async function openImageForTransaction(id: string) {
    if (!accessToken) return;

    setImageModal({ open: true, url: null, loading: true, error: null });

    try {
      const res = await fetch(
        `/api/transactions/image?id=${encodeURIComponent(id)}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      if (!res.ok) {
        if (res.status === 401) {
          router.replace("/login");
          return;
        }
        const text = await res.text().catch(() => "");
        throw new Error(text || `Failed to load image (${res.status}).`);
      }

      const json = (await res.json().catch(() => null)) as any;
      const signedUrl =
        typeof json?.signedUrl === "string" ? json.signedUrl : null;
      if (!signedUrl) throw new Error("Missing signedUrl.");

      setImageModal({
        open: true,
        url: signedUrl,
        loading: false,
        error: null,
      });
    } catch (e: any) {
      const msg =
        typeof e?.message === "string" ? e.message : "Failed to load image.";
      setImageModal({ open: true, url: null, loading: false, error: msg });
    }
  }

  async function deleteTransaction(id: string) {
    if (!accessToken) return;
    if (deletingIds[id]) return;

    setError(null);
    setDeletingIds((prev) => ({ ...prev, [id]: true }));

    let removed: Transaction | null = null;
    let removedIndex = -1;
    setRows((prev) => {
      const idx = prev.findIndex((r) => r.id === id);
      removedIndex = idx;
      removed = idx >= 0 ? prev[idx] : null;
      return prev.filter((r) => r.id !== id);
    });

    try {
      const res = await fetch("/api/transactions", {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id }),
      });

      if (!res.ok) {
        if (res.status === 401) {
          router.replace("/login");
          return;
        }
        const text = await res.text().catch(() => "");
        throw new Error(text || `Failed to delete (${res.status}).`);
      }
    } catch (e: any) {
      const msg =
        typeof e?.message === "string" ? e.message : "Failed to delete.";
      setError(msg);
      if (removed) {
        setRows((prev) => {
          if (prev.some((r) => r.id === removed!.id)) return prev;
          const next = [...prev];
          const insertAt =
            removedIndex >= 0 ? Math.min(removedIndex, next.length) : 0;
          next.splice(insertAt, 0, removed!);
          return next;
        });
      }
    } finally {
      setDeletingIds((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setDragDx((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setDraggingId((cur) => (cur === id ? null : cur));
      setHasDragged(false);
    }
  }

  async function saveEdits() {
    if (!accessToken || !editingId || !draft) return;
    if (saving) return;

    setError(null);
    setSaving(true);

    const totalCents = amountStringToCents(draft.amount);
    if (draft.amount.trim().length > 0 && totalCents === null) {
      setSaving(false);
      setError("Amount must be a valid number (e.g., 12.34).");
      return;
    }

    const currency = draft.currency.trim().toUpperCase();
    if (currency.length > 0 && currency.length !== 3) {
      setSaving(false);
      setError("Currency must be a 3-letter code (e.g., CAD).");
      return;
    }

    try {
      const res = await fetch("/api/transactions", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: editingId,
          merchant: draft.merchant.trim().length ? draft.merchant.trim() : null,
          txn_date: draft.txn_date.trim().length ? draft.txn_date.trim() : null,
          total_cents: totalCents,
          currency: currency.length ? currency : null,
          category: draft.category.trim().length ? draft.category.trim() : null,
        }),
      });

      if (!res.ok) {
        if (res.status === 401) {
          router.replace("/login");
          return;
        }
        const text = await res.text().catch(() => "");
        throw new Error(text || `Failed to save (${res.status}).`);
      }

      const json = (await res.json().catch(() => null)) as any;
      const updated = json?.transaction as Transaction | undefined;
      if (!updated?.id) throw new Error("Missing updated transaction.");

      setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      setEditingId(null);
      setDraft(null);
    } catch (e: any) {
      const msg =
        typeof e?.message === "string" ? e.message : "Failed to save.";
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  function startEditing(t: Transaction) {
    setError(null);
    setEditingId(t.id);
    setDraft(toDraft(t));
  }

  function cancelEditing() {
    setEditingId(null);
    setDraft(null);
    setSaving(false);
  }

  function onPointerDown(e: React.PointerEvent, id: string) {
    if (deletingIds[id]) return;
    setDraggingId(id);
    setDragStartX(e.clientX);
    setHasDragged(false);
    try {
      (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  }

  function onPointerMove(e: React.PointerEvent, id: string) {
    if (draggingId !== id) return;
    const dx = e.clientX - dragStartX;
    if (!hasDragged && Math.abs(dx) > 6) setHasDragged(true);

    // Only allow swiping left (negative X)
    const clamped = Math.min(0, Math.max(dx, -140));
    setDragDx((prev) => ({ ...prev, [id]: clamped }));
  }

  function onPointerUp(e: React.PointerEvent, id: string) {
    if (draggingId !== id) return;
    const dx = dragDx[id] ?? 0;
    const shouldDelete = dx <= -90;
    if (shouldDelete) {
      void deleteTransaction(id);
      return;
    }

    setDragDx((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setDraggingId(null);
    setHasDragged(false);
  }

  function onClickCapture(e: React.MouseEvent) {
    if (hasDragged) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  if (!ready) return null;

  return (
    <main style={{ maxWidth: 720, margin: "48px auto", padding: 16 }}>
      {imageModal.open ? (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() =>
            setImageModal({
              open: false,
              url: null,
              loading: false,
              error: null,
            })
          }
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,1)",
            display: "flex",
            alignItems: "stretch",
            justifyContent: "center",
            padding: 16,
            overflowY: "auto",
            WebkitOverflowScrolling: "touch",
            zIndex: 50,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(720px, 100%)",
              maxHeight: "calc(100vh - 32px)",
              borderRadius: 12,
              border: "1px solid var(--card-border)",
              background: "var(--card-bg)",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                padding: 12,
                borderBottom: "1px solid var(--card-border)",
                position: "sticky",
                top: 0,
                background: "var(--card-bg)",
                zIndex: 1,
              }}
            >
              <div style={{ fontWeight: 600 }}>Receipt</div>
              <button
                type="button"
                onClick={() =>
                  setImageModal({
                    open: false,
                    url: null,
                    loading: false,
                    error: null,
                  })
                }
                style={{
                  padding: "6px 10px",
                  borderRadius: 8,
                  border: "1px solid var(--control-border)",
                  background: "var(--control-bg)",
                  color: "var(--foreground)",
                  cursor: "pointer",
                }}
              >
                Close
              </button>
            </div>

            {imageModal.loading ? (
              <div style={{ opacity: 0.85, padding: 12 }}>Loading image…</div>
            ) : imageModal.error ? (
              <div style={{ opacity: 0.85, padding: 12 }}>
                {imageModal.error}
              </div>
            ) : imageModal.url ? (
              <div style={{ overflowY: "auto", padding: 12 }}>
                <img
                  src={imageModal.url}
                  alt="Transaction receipt"
                  style={{
                    width: "100%",
                    height: "auto",
                    borderRadius: 10,
                    border: "1px solid var(--control-border)",
                    background: "var(--control-bg)",
                    display: "block",
                  }}
                />
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div
        style={{ display: "flex", justifyContent: "space-between", gap: 12 }}
      >
        <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 16 }}>
          Transactions
        </h1>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/" style={{ padding: "10px 12px" }}>
            Home
          </Link>
          <Link href="/add" style={{ padding: "10px 12px" }}>
            Add
          </Link>
        </div>
      </div>

      {error ? (
        <div
          style={{
            marginBottom: 12,
            padding: 12,
            borderRadius: 12,
            border: "1px solid var(--card-border)",
            background: "var(--card-bg)",
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Error</div>
          <div style={{ opacity: 0.85 }}>{error}</div>
        </div>
      ) : null}

      {rows.length === 0 && !error ? (
        <div
          style={{
            padding: 16,
            borderRadius: 12,
            border: "1px solid var(--card-border)",
            background: "var(--card-bg)",
          }}
        >
          <p>No transactions yet.</p>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {rows.map((t) =>
            (() => {
              const isEditing = editingId === t.id;
              const currentDraft = isEditing ? draft : null;
              const categories = [
                "Groceries",
                "Dining",
                "Transport",
                "Shopping",
                "Bills",
                "Entertainment",
                "Health",
                "Travel",
                "Education",
                "Subscriptions",
                "Income",
                "Other",
              ];

              return (
                <div
                  key={t.id}
                  style={{
                    position: "relative",
                    borderRadius: 10,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      borderRadius: 10,
                      border: "1px solid var(--card-border)",
                      background: "var(--control-bg)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "flex-end",
                      paddingRight: 14,
                      pointerEvents: "none",
                      opacity: (() => {
                        const dx = dragDx[t.id] ?? 0;
                        if (dx >= -8) return 0;
                        return Math.min(1, (-dx - 8) / 32);
                      })(),
                      transition:
                        draggingId === t.id ? "none" : "opacity 120ms ease-out",
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>Delete</span>
                  </div>

                  <div
                    onClickCapture={onClickCapture}
                    onPointerDown={(e) => onPointerDown(e, t.id)}
                    onPointerMove={(e) => onPointerMove(e, t.id)}
                    onPointerUp={(e) => onPointerUp(e, t.id)}
                    onPointerCancel={(e) => onPointerUp(e, t.id)}
                    style={{
                      border: "1px solid var(--card-border)",
                      borderRadius: 10,
                      padding: 12,
                      background: "var(--card-bg)",
                      transform: `translateX(${dragDx[t.id] ?? 0}px)`,
                      transition:
                        draggingId === t.id
                          ? "none"
                          : "transform 140ms ease-out",
                      touchAction: "pan-y",
                      userSelect: isEditing ? "auto" : "none",
                      cursor: deletingIds[t.id]
                        ? "not-allowed"
                        : isEditing
                        ? "default"
                        : "grab",
                      opacity: deletingIds[t.id] ? 0.7 : 1,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 12,
                      }}
                    >
                      <div style={{ minWidth: 0, flex: 1 }}>
                        {isEditing && currentDraft ? (
                          <div
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => e.stopPropagation()}
                            style={{ display: "grid", gap: 8 }}
                          >
                            <div style={{ display: "grid", gap: 6 }}>
                              <label style={{ fontSize: 12, opacity: 0.75 }}>
                                Merchant
                              </label>
                              <input
                                value={currentDraft.merchant}
                                onChange={(e) =>
                                  setDraft((prev) =>
                                    prev
                                      ? { ...prev, merchant: e.target.value }
                                      : prev
                                  )
                                }
                                placeholder="e.g., Costco"
                                style={{
                                  width: "100%",
                                  padding: "10px 10px",
                                  borderRadius: 8,
                                  border: "1px solid var(--control-border)",
                                  background: "var(--control-bg)",
                                  color: "var(--foreground)",
                                }}
                              />
                            </div>

                            <div style={{ display: "grid", gap: 6 }}>
                              <label style={{ fontSize: 12, opacity: 0.75 }}>
                                Date
                              </label>
                              <input
                                type="date"
                                value={currentDraft.txn_date}
                                onChange={(e) =>
                                  setDraft((prev) =>
                                    prev
                                      ? { ...prev, txn_date: e.target.value }
                                      : prev
                                  )
                                }
                                style={{
                                  width: "fit-content",
                                  padding: "10px 10px",
                                  borderRadius: 8,
                                  border: "1px solid var(--control-border)",
                                  background: "var(--control-bg)",
                                  color: "var(--foreground)",
                                }}
                              />
                            </div>

                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns: "1fr 110px",
                                gap: 10,
                              }}
                            >
                              <div style={{ display: "grid", gap: 6 }}>
                                <label style={{ fontSize: 12, opacity: 0.75 }}>
                                  Amount
                                </label>
                                <input
                                  inputMode="decimal"
                                  value={currentDraft.amount}
                                  onChange={(e) =>
                                    setDraft((prev) =>
                                      prev
                                        ? { ...prev, amount: e.target.value }
                                        : prev
                                    )
                                  }
                                  placeholder="e.g., 12.34"
                                  style={{
                                    width: "100%",
                                    padding: "10px 10px",
                                    borderRadius: 8,
                                    border: "1px solid var(--control-border)",
                                    background: "var(--control-bg)",
                                    color: "var(--foreground)",
                                  }}
                                />
                              </div>

                              <div style={{ display: "grid", gap: 6 }}>
                                <label style={{ fontSize: 12, opacity: 0.75 }}>
                                  Currency
                                </label>
                                <input
                                  value={currentDraft.currency}
                                  onChange={(e) =>
                                    setDraft((prev) =>
                                      prev
                                        ? {
                                            ...prev,
                                            currency:
                                              e.target.value.toUpperCase(),
                                          }
                                        : prev
                                    )
                                  }
                                  placeholder="CAD"
                                  maxLength={3}
                                  style={{
                                    width: "100%",
                                    padding: "10px 10px",
                                    borderRadius: 8,
                                    border: "1px solid var(--control-border)",
                                    background: "var(--control-bg)",
                                    color: "var(--foreground)",
                                    textTransform: "uppercase",
                                  }}
                                />
                              </div>
                            </div>

                            <div style={{ display: "grid", gap: 6 }}>
                              <label style={{ fontSize: 12, opacity: 0.75 }}>
                                Category
                              </label>
                              <select
                                value={currentDraft.category}
                                onChange={(e) =>
                                  setDraft((prev) =>
                                    prev
                                      ? { ...prev, category: e.target.value }
                                      : prev
                                  )
                                }
                                style={{
                                  width: "fit-content",
                                  padding: "10px 10px",
                                  borderRadius: 8,
                                  border: "1px solid var(--control-border)",
                                  background: "var(--control-bg)",
                                  color: "var(--foreground)",
                                }}
                              >
                                <option value="">—</option>
                                {categories.map((c) => (
                                  <option key={c} value={c}>
                                    {c}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div style={{ fontWeight: 600 }}>
                              {t.merchant ?? "Unknown merchant"}
                            </div>
                            <div style={{ opacity: 0.75, marginTop: 6 }}>
                              {t.category ?? "—"} · {t.txn_date ?? "—"}
                            </div>
                            <div
                              style={{
                                opacity: 0.6,
                                marginTop: 8,
                                fontSize: 12,
                              }}
                            >
                              Swipe left to delete
                            </div>
                          </>
                        )}
                      </div>

                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "flex-end",
                          gap: 10,
                          whiteSpace: "nowrap",
                          fontWeight: 600,
                        }}
                      >
                        {isEditing ? (
                          <>
                            <button
                              type="button"
                              onPointerDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation();
                                void saveEdits();
                              }}
                              disabled={saving}
                              style={{
                                padding: "8px 10px",
                                borderRadius: 8,
                                border: "1px solid var(--control-border)",
                                background: "var(--control-bg)",
                                color: "var(--foreground)",
                                cursor: saving ? "not-allowed" : "pointer",
                                opacity: saving ? 0.7 : 1,
                              }}
                            >
                              {saving ? "Saving…" : "Save"}
                            </button>
                            <button
                              type="button"
                              onPointerDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation();
                                cancelEditing();
                              }}
                              disabled={saving}
                              style={{
                                padding: "8px 10px",
                                borderRadius: 8,
                                border: "1px solid var(--control-border)",
                                background: "var(--control-bg)",
                                color: "var(--foreground)",
                                cursor: saving ? "not-allowed" : "pointer",
                                opacity: saving ? 0.7 : 1,
                              }}
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              startEditing(t);
                            }}
                            style={{
                              padding: "4px 10px",
                              borderRadius: 8,
                              border: "1px solid var(--control-border)",
                              background: "var(--control-bg)",
                              color: "var(--foreground)",
                              cursor: "pointer",
                            }}
                          >
                            Edit
                          </button>
                        )}
                        <button
                          type="button"
                          title={
                            t.image_path ? "View receipt image" : "No image"
                          }
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!t.image_path) {
                              setError(
                                "No image available for this transaction."
                              );
                              return;
                            }
                            void openImageForTransaction(t.id);
                          }}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: 34,
                            height: 34,
                            borderRadius: 8,
                            border: "1px solid var(--control-border)",
                            background: "var(--control-bg)",
                            color: "var(--foreground)",
                            cursor: t.image_path ? "pointer" : "not-allowed",
                            opacity: t.image_path ? 1 : 0.5,
                          }}
                          aria-label="View receipt image"
                          disabled={!t.image_path}
                        >
                          <svg
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <path
                              d="M4 7a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V7Z"
                              stroke="currentColor"
                              strokeWidth="1.8"
                            />
                            <path
                              d="M8 11.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"
                              stroke="currentColor"
                              strokeWidth="1.8"
                            />
                            <path
                              d="M21 16l-5.2-5.2a1 1 0 0 0-1.4 0L6 19"
                              stroke="currentColor"
                              strokeWidth="1.8"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </button>
                        {isEditing && currentDraft
                          ? formatMoney(
                              amountStringToCents(currentDraft.amount),
                              currentDraft.currency.trim().toUpperCase() ||
                                t.currency
                            )
                          : formatMoney(t.total_cents, t.currency)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()
          )}
          {/* Add sum of all transactions */}
          {/* If transactions have different currencies, consider how to handle that */}
          <div
            style={{
              marginTop: 12,
              padding: 12,
              borderRadius: 10,
              border: "1px solid var(--card-border)",
              background: "var(--card-bg)",
              fontWeight: 600,
              textAlign: "right",
              width: "fit-content",
              marginLeft: "auto",
            }}
          >
            {/* If transactions have different currencies, consider how to handle that */}
            {/* if more than one currency, display one total for each currency */}
            Total:{" "}
            <span>
              {(() => {
                const totals: Record<string, number> = {};
                rows.forEach((r) => {
                  const curr = r.currency || "CAD";
                  if (!totals[curr]) totals[curr] = 0;
                  totals[curr] += r.total_cents || 0;
                });
                return Object.entries(totals)
                  .map(([curr, amount]) => formatMoney(amount, curr))
                  .join(", ");
              })()}
            </span>
          </div>
        </div>
      )}
    </main>
  );
}
