import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

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

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing id." }, { status: 400 });
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

  if (!txn.image_path) {
    return NextResponse.json({ error: "No image available." }, { status: 404 });
  }

  const bucket = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET ?? "receipts";
  const { data, error: signError } = await supabaseAdmin.storage
    .from(bucket)
    .createSignedUrl(txn.image_path, 60 * 10);

  if (signError || !data?.signedUrl) {
    return NextResponse.json(
      { error: signError?.message ?? "Failed to create signed URL." },
      { status: 500 }
    );
  }

  return NextResponse.json({ signedUrl: data.signedUrl }, { status: 200 });
}
