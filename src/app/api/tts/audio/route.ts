import { NextResponse } from "next/server";

export const runtime = "nodejs";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchWithRetry(url: string, tries = 8) {
  let last: Response | null = null;

  for (let i = 0; i < tries; i++) {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "*/*",
        "Accept-Encoding": "identity",
        // Range giúp một số CDN trả 206 thay vì fail
        "Range": "bytes=0-",
      },
    });

    // ✅ nếu đã có file: 200 OK hoặc 206 Partial Content
    if (res.ok || res.status === 206) return res;

    last = res;

    // ✅ 404 = thường do file chưa sẵn sàng -> chờ và retry
    if (res.status === 404) {
      await sleep(150 + i * 120); // backoff nhẹ
      continue;
    }

    // các lỗi khác thì break sớm
    break;
  }

  return last;
}


export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get("url");
  if (!url) return NextResponse.json({ error: "Missing url" }, { status: 400 });

  let u: URL;
  try { u = new URL(url); } 
  catch { return NextResponse.json({ error: "Invalid url" }, { status: 400 }); }

  // allow only *.zalo.ai
  const host = u.hostname;
  const allowed = host.endsWith(".zalo.ai") || host === "zalo.ai";
  if (!allowed) {
    return NextResponse.json({ error: "Host not allowed", host }, { status: 400 });
  }

  const upstream = await fetchWithRetry(url, 8);
    if (!upstream) {
    return NextResponse.json({ error: "Upstream fetch failed (no response)" }, { status: 502 });
    }


  console.log("[tts/audio] upstream", {
    status: upstream.status,
    ct: upstream.headers.get("content-type"),
    len: upstream.headers.get("content-length"),
  });

  if (!(upstream.ok || upstream.status === 206)) {
    const t = await upstream.text().catch(() => "");
    return NextResponse.json(
      { error: "Upstream audio fetch failed", status: upstream.status, detail: t.slice(0, 300) },
      { status: 502 }
    );
  }
  

  const buf = await upstream.arrayBuffer();
  const contentType = upstream.headers.get("content-type") || "audio/mpeg";

  return new Response(buf, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "no-store",
    },
  });
}
