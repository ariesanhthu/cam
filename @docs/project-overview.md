## 👀 Tổng quan dự án

**VoiceControl Cam** là web app Next.js cho phép điều khiển workflow thị giác bằng giọng nói tiếng Việt.  
Người dùng nói "bạn ơi!" để kích hoạt, sau đó nói yêu cầu; app sẽ:

- **Lấy ảnh** từ camera thiết bị hoặc từ **Supabase Storage**
- **Gửi ảnh + prompt** tới backend (`/analyze`)
- **Nhận kết quả phân tích** và **đọc lại** bằng TTS (mặc định tiếng Việt, có thể chọn tiếng Anh - nếu bật)

---

## 🧱 Công nghệ & kiến trúc chính

- **Frontend**: Next.js App Router (`src/app`), React 19, TypeScript, Tailwind CSS 4
- **State & logic**:
  - Hooks tùy biến: `useSpeechRecognition`, `useVoiceControl`, `useSettings`, `useNotification`
  - Component UI: `VoiceControlButton`, `StatusDisplay`, `SettingsPanel`, `NotificationToast`
- **Tích hợp**:
  - **SpeechRecognition API** (browser) cho nhận diện giọng nói
  - **SpeechSynthesis API** cho TTS (hỗ trợ tiếng Việt `vi-VN` mặc định và tiếng Anh `en-US`)
  - **Supabase** để lưu config app + lấy ảnh từ storage
  - **Backend HTTP** tùy chỉnh (URL cấu hình được) cho endpoint phân tích ảnh + prompt

---

## 🗂 Cấu trúc thư mục chính

- **`src/app`**
  - `layout.tsx`: layout Next.js chung (global styles, shell)
  - `page.tsx`: trang chính `VoiceControlApp` – wiring toàn bộ hooks & UI
- **`src/components`**
  - `VoiceControlButton.tsx`: nút tròn lớn chính để bật/tắt nghe
  - `StatusDisplay.tsx`: hiển thị trạng thái hiện tại, request đang xử lý và hint trigger
  - `SettingsPanel.tsx`: slide-over panel bên phải cho cấu hình backend / camera / giọng đọc
  - `NotificationToast.tsx`: toast thông báo nổi dưới màn hình
- **`src/hooks`**
  - `useSpeechRecognition.ts`: wrap Web Speech API, quản lý vòng đời recognition
  - `useVoiceControl.ts`: orchestrator logic giọng nói → camera → backend → TTS
  - `useSettings.ts`: load/lưu config (Supabase + localStorage), merge default
  - `useNotification.ts`: quản lý notification state + đọc notification bằng TTS
- **`src/utils`**
  - `speech.ts`: normalize tiếng Việt, detect trigger word, TTS helpers
  - `camera.ts`: chụp ảnh từ camera thiết bị hoặc lấy từ Supabase storage
  - `backend.ts`: build FormData + call backend `/analyze` + xử lý response
- **`src/lib`**
  - `supabase.ts`: client & helpers cho Supabase (settings + image)
- **`src/types`**
  - `index.ts`, `speech-recognition.d.ts`: type cho settings, notification, SpeechRecognition…

---

## 🔁 Luồng chạy chính (happy path)

1. **User mở app**

   - `useSettings` load cấu hình từ Supabase → fallback localStorage → default
   - Hiển thị overlay "Đang tải cấu hình..." đến khi `loaded === true`
   - `useNotification` phát ra welcome toast "Bấm nút để bắt đầu nghe giọng nói"

2. **Bật nghe**

   - User bấm `VoiceControlButton` hoặc phím `Space`
   - `page.tsx` gọi `startListening` từ `useSpeechRecognition`
   - Hook:
     - Setup `SpeechRecognition` (lang `vi-VN`, continuous, interim)
     - Gọi `getUserMedia` cho audio
     - Bắt đầu recognition, set status "Đang nghe..."

3. **Trigger word "bạn ơi!"**

   - Trong `onresult`, text được normalize bằng `normalizeVN`
   - `containsTriggerWord` check `"ban oi"` trong câu
   - Nếu đang `waitingForTrigger`:
     - Gọi `handleTriggerWord` trong `useVoiceControl`
     - Hook:
       - Đổi state: `waitingForTrigger = false`, `waitingForRequest = true`
       - Thông báo / TTS: đọc "Bạn cần giúp gì?" (nếu `settings.speak === true`)
       - Set timeout nếu user im lặng → reset về trạng thái chờ "bạn ơi!"

4. **User nói yêu cầu**

   - Vẫn trong `onresult`:
     - Nếu **không còn chờ trigger** và **đang chờ request**, có **final transcript đủ dài**:
       - Bỏ qua nếu ngay sau khi TTS kết thúc (anti-feedback bằng `lastTTSEndTimeRef`)
       - Bỏ qua nếu còn chứa trigger word trong request
       - Debounce bằng `lastCaptureTimeRef` (>=2s)
       - Gọi `handleUserRequest(promptText)`

5. **Xử lý yêu cầu trong `useVoiceControl`**

   - Set `isProcessing = true`, `waitingForRequest = false`
   - Dừng `SpeechRecognition` để tránh loop
   - **Chuẩn bị ảnh**:
     - Nếu `settings.useDeviceCamera === true`:
       - Gọi `captureFromDeviceCamera` → dùng `ImageCapture` nếu có, fallback `<canvas>`
     - Nếu `false`:
       - Gọi `fetchImageFromSupabaseStorage` → `fetchImageFromSupabase('cam01','image.jpg')`
   - **Gửi backend**:
     - `sendToBackend(blob, promptText, settings)`:
       - Build `FormData` với file (hoặc file trống) + `prompt`
       - Chuẩn hóa URL: đảm bảo kết thúc bằng `/analyze`
       - `fetch` với `POST` + CORS, không ép `Content-Type`
       - Hậu xử lý JSON/text, handle `status: success / error / clarify`
   - **Xử lý kết quả**:
     - Update status "Đã nhận kết quả"
     - Nếu `settings.speak`:
       - `speakResult`:
         - Stop recognition
         - Tắt auto listen
         - `speechSynthesis.speak`
         - Ghi timestamp kết thúc TTS vào `lastTTSEndTimeRef`
         - `onEnd`: set status "Hoàn tất! Hãy nói 'bạn ơi!' để tiếp tục..." và **restart listening** (qua callback `restartListening` hoặc tự start)
     - Nếu không đọc:
       - Chỉ update status và restart recognition sau delay
   - `finally`:
     - Reset flags: `isProcessing = false`, `waitingForTrigger = true`, `waitingForRequest = false`, clear `currentRequest`

6. **Vòng lặp tiếp theo**
   - Sau khi TTS / xử lý xong, recognition được bật lại
   - App quay lại trạng thái **chờ "bạn ơi!"** cho phiên tiếp theo

---

## ⚙️ Màn hình & UI

- **Màn hình chính**
  - Nút tròn `VoiceControlButton` rất to ở giữa:
    - Xanh (idle), đỏ pulsing (đang nghe)
  - `StatusDisplay` bên dưới:
    - Dòng trạng thái chung (`status`)
    - Khung "Đang xử lý yêu cầu: ..." khi `isProcessing`
    - Khung hint "Chờ nghe 'bạn ơi!'" khi chờ trigger
- **Cài đặt (Settings panel)**
  - Mở bằng nút ⚙️ trên góc phải hoặc phím `s`
  - Các group:
    - Backend:
      - `backendUrl` (vd: `http://192.168.1.2:5000/analyze`)
      - Checkbox "Đọc kết quả phân tích" (`speak`)
    - Camera:
      - Checkbox `useDeviceCamera`: ON = chụp từ thiết bị, OFF = lấy từ Supabase
    - Giọng đọc:
      - Dropdown ngôn ngữ (`ttsLanguage`): mặc định "Tiếng Việt" (`vi-VN`), có thể chọn "Tiếng Anh" (`en-US`)
      - Slider tốc độ (`voiceRate`)
      - Slider âm lượng (`voiceVolume`)
  - Action bar trên cùng: **Lưu** (Supabase + localStorage) và **Reset** về default
- **NotificationToast**
  - Hiện ở đáy; `useNotification` điều khiển
  - Tự ẩn sau 3s, có TTS cho message nếu `settings.speak` bật

---

## 🔌 Tích hợp backend & Supabase

- **Backend `/analyze`**
  - Cấu hình qua UI hoặc giá trị mặc định `http://localhost:5000/analyze`
  - Kỳ vọng nhận:
    - `file`: image/jpeg (chụp từ camera hoặc từ Supabase, hoặc file trống)
    - `prompt`: text tiếng Việt người dùng nói
  - Kỳ vọng trả về JSON:
    - `{ status: "success" | "error" | "clarify", text: string, intent?: string }`
  - Client log toàn bộ request/response để debug trong console
- **Supabase**
  - Lưu **app settings** (backend URL, flag speak, camera mode, voice rate/volume)
  - Lưu image input fallback (`cam01/image.jpg`) cho chế độ không dùng camera thiết bị


