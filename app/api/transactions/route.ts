import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { z } from "zod";

async function getUserFromRequest(req: Request) {
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : null;

  if (!token) {
    return {
      token: null,
      user: null,
      error: "Missing Authorization bearer token.",
    } as const;
  }

  const {
    data: { user },
    error: userError,
  } = await supabaseAdmin.auth.getUser(token);

  if (userError || !user) {
    return { token, user: null, error: "Unauthorized." } as const;
  }

  return { token, user, error: null } as const;
}

export async function GET(req: Request) {
  const { user, error: authError } = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: authError }, { status: 401 });
  }

  const { data, error: dbError } = await supabaseAdmin
    .from("transactions")
    .select(
      "id,user_id,created_at,txn_date,merchant,total_cents,currency,category,source_type,image_path,ai_json,confidence"
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  return NextResponse.json({ transactions: data ?? [] }, { status: 200 });
}

export async function DELETE(req: Request) {
  const { user, error: authError } = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: authError }, { status: 401 });
  }

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }

  const id = typeof body?.id === "string" ? body.id : null;
  if (!id) {
    return NextResponse.json(
      { error: "Missing transaction id." },
      { status: 400 }
    );
  }

  const { data: txn, error: txnError } = await supabaseAdmin
    .from("transactions")
    .select("id,image_path")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (txnError) {
    return NextResponse.json({ error: txnError.message }, { status: 500 });
  }

  if (!txn) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const bucket = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET ?? "receipts";

  if (txn.image_path) {
    const { error: storageError } = await supabaseAdmin.storage
      .from(bucket)
      .remove([txn.image_path]);

    // If the file is already gone, continue deleting the DB row.
    if (storageError && !/not\s*found/i.test(storageError.message)) {
      return NextResponse.json(
        { error: storageError.message },
        { status: 500 }
      );
    }
  }

  const { data, error: delError } = await supabaseAdmin
    .from("transactions")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle();

  if (delError) {
    return NextResponse.json({ error: delError.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}

const PatchBodySchema = z
  .object({
    id: z.string().min(1),
    merchant: z
      .union([z.string(), z.null()])
      .optional()
      .transform((v) => {
        if (v === undefined) return undefined;
        if (v === null) return null;
        const trimmed = v.trim();
        return trimmed.length ? trimmed : null;
      }),
    txn_date: z
      .union([z.string(), z.null()])
      .optional()
      .transform((v) => {
        if (v === undefined) return undefined;
        if (v === null) return null;
        const trimmed = v.trim();
        if (!trimmed.length) return null;
        return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
      }),
    total_cents: z
      .union([z.number(), z.string(), z.null()])
      .optional()
      .transform((v) => {
        if (v === undefined) return undefined;
        if (v === null) return null;
        const n = typeof v === "number" ? v : Number(v);
        if (!Number.isFinite(n)) return null;
        const asInt = Math.round(n);
        if (asInt < 0) return null;
        return asInt;
      }),
    currency: z
      .union([z.string(), z.null()])
      .optional()
      .transform((v) => {
        if (v === undefined) return undefined;
        if (v === null) return null;
        const trimmed = v.trim();
        if (!trimmed.length) return null;
        return trimmed.toUpperCase();
      }),
    category: z
      .union([z.string(), z.null()])
      .optional()
      .transform((v) => {
        if (v === undefined) return undefined;
        if (v === null) return null;
        const trimmed = v.trim();
        return trimmed.length ? trimmed : null;
      }),
  })
  .strict();

export async function PATCH(req: Request) {
  const { user, error: authError } = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: authError }, { status: 401 });
  }

  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }

  let parsed: z.infer<typeof PatchBodySchema>;
  try {
    parsed = PatchBodySchema.parse(body);
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Invalid request body." },
      { status: 400 }
    );
  }

  const update: Record<string, any> = {};
  if (parsed.merchant !== undefined) update.merchant = parsed.merchant;
  if (parsed.txn_date !== undefined) update.txn_date = parsed.txn_date;
  if (parsed.total_cents !== undefined) update.total_cents = parsed.total_cents;
  if (parsed.currency !== undefined) update.currency = parsed.currency;
  if (parsed.category !== undefined) update.category = parsed.category;

  if (Object.keys(update).length === 0) {
    return NextResponse.json(
      { error: "No fields to update." },
      { status: 400 }
    );
  }

  const { data, error: updError } = await supabaseAdmin
    .from("transactions")
    .update(update)
    .eq("id", parsed.id)
    .eq("user_id", user.id)
    .select(
      "id,user_id,created_at,txn_date,merchant,total_cents,currency,category,source_type,image_path,ai_json,confidence"
    )
    .maybeSingle();

  if (updError) {
    return NextResponse.json({ error: updError.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  return NextResponse.json({ transaction: data }, { status: 200 });
}
