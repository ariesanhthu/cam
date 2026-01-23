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

// Lấy danh sách API keys từ env, ưu tiên các key mới
function getApiKeys(): string[] {
  const keys: string[] = [];
  
  // Thêm các keys mới (ưu tiên)
  const key1 = process.env.ZALO_AI_TTS_APIKEY1;
  const key2 = process.env.ZALO_AI_TTS_APIKEY2;
  const key3 = process.env.ZALO_AI_TTS_APIKEY3;
  
  if (key1) keys.push(key1);
  if (key2) keys.push(key2);
  if (key3) keys.push(key3);
  
  // Fallback về key cũ nếu có
  const oldKey = process.env.ZALO_AI_TTS_APIKEY;
  if (oldKey && !keys.includes(oldKey)) {
    keys.push(oldKey);
  }
  
  return keys;
}

export async function POST(req: Request) {
  const apiKeys = getApiKeys();
  if (apiKeys.length === 0) {
    return NextResponse.json(
      { error: "Missing ZALO_AI_TTS_APIKEY env variables" },
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

  // Thử từng key cho đến khi thành công
  let lastError: any = null;
  
  for (let i = 0; i < apiKeys.length; i++) {
    const apikey = apiKeys[i];
    
    try {
      const zaloRes = await fetch("https://api.zalo.ai/v1/tts/synthesize", {
        method: "POST",
        headers: {
          apikey,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: form.toString(),
      });

      const data = await zaloRes.json().catch(() => null);

      // Nếu request thành công và có data hợp lệ
      if (zaloRes.ok && data && data.error_code === 0 && data?.data?.url) {
        console.log(`[TTS] Success với API key ${i + 1}/${apiKeys.length}`);
        return NextResponse.json({ url: data.data.url });
      }

      // Nếu key này bị lỗi (quota hết, invalid, etc), thử key tiếp theo
      if (data && data.error_code !== 0) {
        console.warn(`[TTS] Key ${i + 1} failed:`, data.error_code, data.error_message || 'Unknown error');
        lastError = data;
        
        // Nếu không phải lỗi quota/token thì không cần thử key khác
        // Các lỗi thường gặp: -124 (quota exceeded), -125 (invalid key)
        if (data.error_code !== -124 && data.error_code !== -125) {
          return NextResponse.json(
            { error: "Zalo TTS error", detail: data },
            { status: 502 }
          );
        }
        
        // Tiếp tục thử key tiếp theo
        continue;
      }

      // Nếu response không ok hoặc không có data
      if (!zaloRes.ok || !data) {
        console.warn(`[TTS] Key ${i + 1} request failed:`, zaloRes.status);
        lastError = { error: "Request failed", status: zaloRes.status, data };
        continue;
      }
    } catch (error) {
      console.warn(`[TTS] Key ${i + 1} exception:`, error);
      lastError = error;
      continue;
    }
  }

  // Tất cả keys đều fail
  console.error('[TTS] Tất cả API keys đều failed');
  return NextResponse.json(
    { 
      error: "All Zalo TTS API keys failed", 
      detail: lastError,
      tried_keys: apiKeys.length 
    },
    { status: 502 }
  );
}
