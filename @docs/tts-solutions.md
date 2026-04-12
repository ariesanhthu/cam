# Giải pháp Text-to-Speech tiếng Việt không phụ thuộc Browser

## Tổng quan

App hiện tại đang dùng **Web Speech API** (`speechSynthesis`) của browser, nhưng một số thiết bị không có voice tiếng Việt sẵn có. Dưới đây là các giải pháp thay thế:

---

## 1. ResponsiveVoice.js ⭐ (Khuyến nghị - Đơn giản nhất)

### Ưu điểm:

- ✅ Không cần API key (free tier có giới hạn)
- ✅ Hỗ trợ tiếng Việt tốt
- ✅ Dễ tích hợp, chỉ cần thêm script tag
- ✅ Hoạt động trên nhiều trình duyệt
- ✅ Không phụ thuộc vào browser SpeechSynthesis

### Cách tích hợp:

**Bước 1:** Thêm script vào `src/app/layout.tsx`:

```tsx
<script src="https://code.responsivevoice.org/responsivevoice.js?key=YOUR_API_KEY"></script>
```

**Bước 2:** Sử dụng trong code:

```typescript
import {
  speakWithResponsiveVoice,
  isResponsiveVoiceAvailable,
} from "../utils/speech-responsivevoice";

// Kiểm tra availability
if (isResponsiveVoiceAvailable()) {
  await speakWithResponsiveVoice("Xin chào", {
    voice: "Vietnamese Female",
    rate: 1.0,
    volume: 1.0,
  });
}
```

**Lưu ý:** Cần đăng ký API key tại [responsivevoice.org](https://responsivevoice.org) (có free tier)

---

## 2. Google Cloud Text-to-Speech API

### Ưu điểm:

- ✅ Chất lượng cao, giọng tự nhiên
- ✅ Nhiều voice options cho tiếng Việt
- ✅ Đã có implementation trong `speech-cloud.ts`

### Nhược điểm:

- ❌ Cần API key và billing account
- ❌ Có chi phí theo usage

### Cách tích hợp:

Đã có sẵn trong `src/utils/speech-cloud.ts`:

```typescript
import { speakTextCloud, playAudioFromUrl } from "../utils/speech-cloud";

const audioUrl = await speakTextCloud("Xin chào", {
  provider: "google",
  language: "vi-VN",
  googleApiKey: "YOUR_API_KEY",
  googleVoiceName: "vi-VN-Standard-A", // hoặc vi-VN-Wavenet-A
  voiceRate: 1.0,
  voiceVolume: 1.0,
});

await playAudioFromUrl(audioUrl);
```

**Voice options tiếng Việt:**

- `vi-VN-Standard-A` (nữ)
- `vi-VN-Standard-B` (nam)
- `vi-VN-Standard-C` (nữ)
- `vi-VN-Standard-D` (nam)
- `vi-VN-Wavenet-A` (nữ, chất lượng cao hơn)
- `vi-VN-Wavenet-B` (nam, chất lượng cao hơn)

---

## 3. Azure Cognitive Services Speech

### Ưu điểm:

- ✅ Chất lượng cao với Neural voices
- ✅ Đã có implementation trong `speech-cloud.ts`

### Nhược điểm:

- ❌ Cần Azure subscription và API key
- ❌ Có chi phí theo usage

### Cách tích hợp:

```typescript
import { speakTextCloud, playAudioFromUrl } from "../utils/speech-cloud";

const audioUrl = await speakTextCloud("Xin chào", {
  provider: "azure",
  language: "vi-VN",
  azureKey: "YOUR_AZURE_KEY",
  azureRegion: "southeastasia",
  azureVoiceName: "vi-VN-HoaiMyNeural", // Neural voice
  voiceRate: 1.0,
  voiceVolume: 1.0,
});

await playAudioFromUrl(audioUrl);
```

**Voice options tiếng Việt:**

- `vi-VN-HoaiMyNeural` (nữ)
- `vi-VN-NamMinhNeural` (nam)

---

## 4. FPT AI Text-to-Speech (Việt Nam)

### Ưu điểm:

- ✅ Dịch vụ Việt Nam, hỗ trợ tốt tiếng Việt
- ✅ Có nhiều giọng đọc tự nhiên
- ✅ Giá cả hợp lý

### Nhược điểm:

- ❌ Cần đăng ký tài khoản FPT AI
- ❌ Cần implement API wrapper

### Cách tích hợp:

**Bước 1:** Đăng ký tại [fpt.ai](https://fpt.ai) và lấy API key

**Bước 2:** Tạo wrapper (có thể thêm vào `speech-cloud.ts`):

```typescript
const speakWithFPT = async (
  text: string,
  settings: { apiKey: string; voice?: string; speed?: number }
): Promise<string> => {
  const response = await fetch("https://api.fpt.ai/hmi/tts/v5", {
    method: "POST",
    headers: {
      "api-key": settings.apiKey,
      voice: settings.voice || "banmai", // banmai, linhsan, etc.
      speed: String(settings.speed || 0),
    },
    body: text,
  });

  const audioBlob = await response.blob();
  return URL.createObjectURL(audioBlob);
};
```

**Voice options:**

- `banmai` (nữ, trẻ)
- `linhsan` (nữ, trung niên)
- `minhquang` (nam)
- `thuminh` (nữ)

---

## 5. Viettel AI Speech (Việt Nam)

### Ưu điểm:

- ✅ Dịch vụ Việt Nam
- ✅ Chất lượng tốt

### Nhược điểm:

- ❌ Cần đăng ký tài khoản Viettel AI
- ❌ Cần implement API wrapper

---

## 6. Zalo TTS API

### Ưu điểm:

- ✅ Đã có implementation trong `speech-cloud.ts`

### Nhược điểm:

- ❌ Cần Zalo Developer account
- ❌ API có thể thay đổi

---

## Khuyến nghị triển khai

### Option 1: ResponsiveVoice (Nhanh nhất)

1. Thêm script tag vào `layout.tsx`
2. Update `speech.ts` để fallback sang ResponsiveVoice nếu browser TTS không có voice tiếng Việt
3. Không cần thay đổi nhiều code

### Option 2: Hybrid (Browser + Cloud)

1. Ưu tiên dùng browser TTS (miễn phí)
2. Fallback sang ResponsiveVoice hoặc Google Cloud nếu không có voice tiếng Việt
3. Cho phép user chọn provider trong settings

### Option 3: Cloud-only (Chất lượng cao nhất)

1. Dùng Google Cloud hoặc Azure
2. Luôn có voice tiếng Việt chất lượng cao
3. Cần setup billing và API keys

---

## Code example: Hybrid approach

```typescript
// src/utils/speech.ts - Updated version
import {
  speakWithResponsiveVoice,
  isResponsiveVoiceAvailable,
} from "./speech-responsivevoice";

export const speakText = async (
  text: string,
  settings: {
    voiceRate: number;
    voiceVolume: number;
    ttsLanguage?: "vi-VN" | "en-US";
  }
  // ... other params
) => {
  const targetLang = settings.ttsLanguage || "vi-VN";

  // Nếu là tiếng Việt và không có voice tiếng Việt trong browser
  if (targetLang === "vi-VN") {
    const voice = await getVoiceForLanguage("vi-VN");

    // Fallback sang ResponsiveVoice nếu không có voice tiếng Việt
    if (!voice || !voice.lang.startsWith("vi")) {
      if (isResponsiveVoiceAvailable()) {
        console.log("Using ResponsiveVoice for Vietnamese");
        return speakWithResponsiveVoice(
          text,
          {
            voice: "Vietnamese Female",
            rate: settings.voiceRate,
            volume: settings.voiceVolume,
          },
          onEnd
        );
      }
    }
  }

  // Dùng browser TTS như bình thường
  // ... existing code
};
```

---

## So sánh nhanh

| Giải pháp       | Chi phí   | Chất lượng | Độ khó tích hợp | Voice tiếng Việt   |
| --------------- | --------- | ---------- | --------------- | ------------------ |
| Browser TTS     | Free      | Trung bình | Dễ              | Phụ thuộc thiết bị |
| ResponsiveVoice | Free/Paid | Tốt        | Dễ              | ✅ Có              |
| Google Cloud    | Paid      | Rất tốt    | Trung bình      | ✅ Nhiều options   |
| Azure           | Paid      | Rất tốt    | Trung bình      | ✅ Neural voices   |
| FPT AI          | Paid      | Tốt        | Trung bình      | ✅ Nhiều giọng     |
| Zalo            | Paid      | Tốt        | Trung bình      | ✅ Có              |

---

## Next steps

1. **Nếu muốn nhanh:** Dùng ResponsiveVoice (thêm script tag)
2. **Nếu muốn chất lượng:** Dùng Google Cloud hoặc Azure
3. **Nếu muốn hỗ trợ Việt Nam:** Dùng FPT AI hoặc Viettel AI
4. **Nếu muốn hybrid:** Kết hợp browser TTS + ResponsiveVoice fallback
