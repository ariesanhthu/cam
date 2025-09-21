Ok, giờ bạn đã có ESP32-CAM upload ảnh vào **bucket `cam` trên Supabase**. Giờ mình viết **guide cho lập trình viên web Next.js** để truy cập ảnh:

---

# 📝 Guide: Truy cập ảnh từ Supabase bucket trong Next.js

## 1. Cài thư viện Supabase client

Trong dự án Next.js:

```bash
npm install @supabase/supabase-js
```

## 2. Tạo Supabase client

Trong `lib/supabaseClient.ts` (hoặc `utils/supabase.ts`):

```ts
import { createClient } from '@supabase/supabase-js'

// Lấy từ Supabase Settings → API
const supabaseUrl = "https://xrnbwcegjthahwyoppxp.supabase.co"
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseKey)
```

> ⚠️ Dùng biến môi trường `.env.local` để tránh lộ key:

```env
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1...
```

## 3. Cách lấy ảnh

### Nếu bucket **Public**

ESP32 đã upload ảnh theo path:
`cam01/20250922_101530.jpg`

Ảnh sẽ có URL public cố định:

```
https://xrnbwcegjthahwyoppxp.supabase.co/storage/v1/object/public/cam/cam01/20250922_101530.jpg
```

Trong Next.js bạn chỉ cần render `<img>`:

```tsx
export default function CameraImage() {
  const imageUrl = "https://xrnbwcegjthahwyoppxp.supabase.co/storage/v1/object/public/cam/cam01/20250922_101530.jpg"

  return (
    <div>
      <h2>Ảnh từ ESP32-CAM</h2>
      <img src={imageUrl} alt="ESP32-CAM" width={480} />
    </div>
  )
}
```

### Nếu bucket **Private**

Bạn không thể dùng URL trực tiếp. Cần **signed URL**:

```ts
async function getSignedUrl(path: string) {
  const { data, error } = await supabase
    .storage
    .from("cam")
    .createSignedUrl(path, 60) // URL sống 60s

  if (error) throw error
  return data.signedUrl
}
```

Ví dụ dùng trong API route `/api/get-image`:

```ts
// pages/api/get-image.ts
import type { NextApiRequest, NextApiResponse } from 'next'
import { supabase } from '@/lib/supabaseClient'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { path } = req.query // ví dụ: cam01/20250922_101530.jpg
  if (!path || typeof path !== 'string') return res.status(400).json({ error: 'Missing path' })

  const { data, error } = await supabase
    .storage
    .from('cam')
    .createSignedUrl(path, 300) // 5 phút

  if (error) return res.status(500).json({ error: error.message })

  res.status(200).json({ url: data.signedUrl })
}
```

Client gọi API này để lấy URL → render ảnh.

---

## 4. Lấy danh sách ảnh (list files)

Bạn cũng có thể lấy danh sách ảnh trong folder:

```ts
async function listImages() {
  const { data, error } = await supabase
    .storage
    .from('cam')
    .list('cam01', { limit: 10, sortBy: { column: 'created_at', order: 'desc' } })

  if (error) throw error
  return data // [{ name: "20250922_101530.jpg", ... }]
}
```

---

## 5. Best practice

* Với bucket **Public**: dùng URL public trực tiếp (nhanh gọn).
* Với bucket **Private**: dùng API route hoặc Edge Function để generate **signed URL** (bảo mật hơn).
* ESP32 upload → Next.js hiển thị = chỉ cần thống nhất **prefix DEVICE\_ID** (vd: `cam01`).

---

👉 Bạn muốn mình viết sẵn **component Next.js (React)** hiển thị **gallery ảnh mới nhất từ folder cam01** luôn không?
