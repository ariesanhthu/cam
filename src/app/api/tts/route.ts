import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Body = {
  text?: string;
  speed?: number;        // 0.8 - 1.2
  speaker_id?: number;   // 1..6
  encode_type?: number;  // 0 wav, 1 mp3, 2 aac
  quality?: number;      // 0/1 (paid)
};

function clampSpeed(x: number) {
  if (!Number.isFinite(x)) return 1.0;
  return Math.min(1.2, Math.max(0.8, x));
}

export async function POST(req: Request) {
  const apikey = process.env.ZALO_AI_TTS_APIKEY;
  if (!apikey) {
    return NextResponse.json(
      { error: "Missing ZALO_AI_TTS_APIKEY env" },
      { status: 500 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as Body;
  const text = (body.text || "").trim();
  if (!text) return NextResponse.json({ error: "Missing text" }, { status: 400 });

  // Zalo giới hạn 2000 chars (theo docs)
  if (text.length > 2000) {
    return NextResponse.json({ error: "Text exceeds 2000 characters" }, { status: 400 });
  }

  const speed = clampSpeed(body.speed ?? 1.0);
  const speaker_id = body.speaker_id ?? 1;
  const encode_type = body.encode_type ?? 1; // mp3 default

  const form = new URLSearchParams();
  form.set("input", text);
  form.set("speed", String(speed));
  form.set("speaker_id", String(speaker_id));
  form.set("encode_type", String(encode_type));
  // form.set("quality", String(body.quality ?? 0)); // nếu bạn dùng gói trả phí thì mở

  const zaloRes = await fetch("https://api.zalo.ai/v1/tts/synthesize", {
    method: "POST",
    headers: {
      apikey,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });

  const data = await zaloRes.json().catch(() => null);

  if (!zaloRes.ok || !data) {
    return NextResponse.json(
      { error: "Zalo TTS request failed", detail: data },
      { status: 502 }
    );
  }

  // Expect: { error_code: 0, data: { url: "..." } }
  if (data.error_code !== 0 || !data?.data?.url) {
    return NextResponse.json(
      { error: "Zalo TTS error", detail: data },
      { status: 502 }
    );
  }

  return NextResponse.json({ url: data.data.url });
}
