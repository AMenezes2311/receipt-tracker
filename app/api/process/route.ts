import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const SourceTypeInputSchema = z
  .enum(["receipt", "screenshot", "camera", "upload"])
  .transform((v) => (v === "screenshot" ? "screenshot" : "receipt"));

// 1) Validate incoming request
const BodySchema = z.object({
  imagePath: z.string().min(1),
  sourceType: SourceTypeInputSchema,
});

// 2) Validate model output
// Nothing is required: missing/invalid values become null.
const ReceiptSchema = z
  .object({
    merchant: z.string().nullable().optional().default(null),
    txn_date: z
      .preprocess((v) => {
        if (v === null || v === undefined) return null;
        if (typeof v !== "string") return null;
        const trimmed = v.trim();
        // Common model glitches: "", "\"\"", "//", etc.
        if (trimmed === "" || trimmed === "//") return null;
        if (trimmed.replace(/"/g, "") === "") return null;
        // Only accept YYYY-MM-DD; otherwise treat as unknown.
        return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
      }, z.string().nullable())
      .optional()
      .default(null),
    total_cents: z
      .preprocess((v) => {
        if (v === null || v === undefined) return null;
        if (typeof v === "number") return v;
        if (typeof v === "string") {
          const n = Number(v);
          return Number.isFinite(n) ? n : null;
        }
        return null;
      }, z.number().int().nonnegative().nullable())
      .optional()
      .default(null),
    currency: z
      .preprocess((v) => {
        if (v === null || v === undefined) return "CAD";
        if (typeof v !== "string") return "CAD";
        const trimmed = v.trim();
        return trimmed.length ? trimmed.toUpperCase() : "CAD";
      }, z.string())
      .optional()
      .default("CAD"),
    category: z.string().nullable().optional().default(null),
    confidence: z
      .preprocess((v) => {
        if (v === null || v === undefined) return null;
        if (typeof v === "number") return v;
        if (typeof v === "string") {
          const n = Number(v);
          return Number.isFinite(n) ? n : null;
        }
        return null;
      }, z.number().min(0).max(1).nullable())
      .optional()
      .default(null),
    notes: z.string().nullable().optional().default(null),
  })
  .partial();

async function callOpenAiVision(params: {
  signedUrl: string;
  sourceType: "receipt" | "screenshot";
}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY.");

  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

  const schema = {
    name: "receipt_extraction",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        merchant: { type: ["string", "null"] },
        txn_date: {
          type: ["string", "null"],
          description:
            "Date if present. Prefer YYYY-MM-DD, otherwise use null.",
        },
        total_cents: {
          type: ["integer", "null"],
          description: "Total amount in cents",
        },
        currency: { type: "string" },
        category: { type: ["string", "null"] },
        confidence: { type: ["number", "null"], minimum: 0, maximum: 1 },
        notes: { type: ["string", "null"] },
      },
      required: [
        "merchant",
        "txn_date",
        "total_cents",
        "currency",
        "category",
        "confidence",
        "notes",
      ],
    },
  };

  const prompt = `
You extract transaction info from an image of a ${params.sourceType}.
Return best-effort values. If uncertain, use null and lower confidence.
Categories should be one of: Groceries, Dining, Transport, Shopping, Bills, Entertainment, Health, Travel, Education, Subscriptions, Income, Other.
If you see a dollar total like 23.47, total_cents should be 2347.
Give correct ISO currency codes like USD, CAD, EUR, etc.
txn_date must be YYYY-MM-DD.
`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60_000);

  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: prompt },
            { type: "input_image", image_url: params.signedUrl },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: schema.name,
          strict: schema.strict,
          schema: schema.schema,
        },
      },
    }),
    signal: controller.signal,
  });

  clearTimeout(timeoutId);

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `OpenAI request failed (${res.status}).`);
  }

  const payload: any = await res.json();
  const directText: unknown = payload?.output_text;
  if (typeof directText === "string" && directText.trim().length > 0) {
    return directText;
  }

  // Robust fallback: Responses API may omit `output_text`; extract from `output[].content[]`.
  const output = Array.isArray(payload?.output) ? payload.output : [];
  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const part of content) {
      if (part?.type === "output_text" && typeof part?.text === "string") {
        return part.text;
      }
      if (part?.type === "output_json" && part?.json != null) {
        return JSON.stringify(part.json);
      }
      if (typeof part?.text === "string" && part.text.trim().length > 0) {
        return part.text;
      }
    }
  }

  throw new Error("OpenAI response missing output text/json.");
}

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length)
      : null;

    if (!token) {
      return NextResponse.json(
        { error: "Missing Authorization bearer token." },
        { status: 401 }
      );
    }

    const {
      data: { user },
      error: userError,
    } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = BodySchema.parse(await req.json());

    // Create a signed read URL for the private image
    const bucket =
      process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET ?? "receipts";
    const { data: signed, error: signedErr } = await supabaseAdmin.storage
      .from(bucket)
      .createSignedUrl(body.imagePath, 60 * 10); // 10 minutes

    if (signedErr || !signed?.signedUrl) {
      return NextResponse.json(
        { error: signedErr?.message ?? "No signed URL" },
        { status: 500 }
      );
    }

    const rawText = await callOpenAiVision({
      signedUrl: signed.signedUrl,
      sourceType: body.sourceType,
    });

    const parsed = ReceiptSchema.parse(JSON.parse(rawText));

    // Insert into DB (source_type is guaranteed valid now)
    const { data: txn, error: insertErr } = await supabaseAdmin
      .from("transactions")
      .insert({
        user_id: user.id,
        source_type: body.sourceType,
        image_path: body.imagePath,
        merchant: parsed.merchant,
        txn_date: parsed.txn_date,
        total_cents: parsed.total_cents,
        currency: parsed.currency ?? "CAD",
        category: parsed.category,
        confidence: parsed.confidence,
        ai_json: parsed,
      })
      .select()
      .single();

    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    return NextResponse.json({ transaction: txn });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? String(e) },
      { status: 400 }
    );
  }
}
