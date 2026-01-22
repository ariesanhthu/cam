import { useRef, useCallback } from 'react';
import { normalizeVN, containsTriggerWord, isSpeaking, unlockAudio } from '../utils/speech';

interface UseSpeechRecognitionProps {
  isProcessing: boolean;
  waitingForTrigger: boolean;
  waitingForRequest: boolean;
  onTriggerWord: () => void;
  onUserRequest: (text: string) => void;
  onStatusChange: (status: string) => void;
  setIsListening?: (listening: boolean) => void;
  lastTTSEndTimeRef: React.MutableRefObject<number>;
}

export const useSpeechRecognition = ({
  isProcessing,
  waitingForTrigger,
  waitingForRequest,
  onTriggerWord,
  onUserRequest,
  onStatusChange,
  setIsListening,
  lastTTSEndTimeRef
}: UseSpeechRecognitionProps) => {
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const shouldAutoListenRef = useRef(false);

  const lastCaptureTimeRef = useRef(0);
  const waitingForTriggerRef = useRef(waitingForTrigger);
  const waitingForRequestRef = useRef(waitingForRequest);

  // ✅ FIX stale closure: luôn đọc state mới nhất trong handler
  const isProcessingRef = useRef(isProcessing);
  isProcessingRef.current = isProcessing;

  // ✅ chống lặp final (Chrome/mobile hay bắn final lặp)
  const lastFinalNormalizedRef = useRef('');
  const lastFinalTimeRef = useRef(0);

  // Track khi TTS kết thúc (nếu bạn set từ ngoài, giữ ref này để đồng bộ)
  // const lastTTSEndTimeRef = useRef(0); // REMOVED internal ref, use prop

  // Sync ref với state
  waitingForTriggerRef.current = waitingForTrigger;
  waitingForRequestRef.current = waitingForRequest;

  const safeStartRecognition = () => {
    if (!recognitionRef.current) return;
    try {
      recognitionRef.current.start();
    } catch {
      // ignore InvalidStateError khi start quá sớm
    }
  };

  const setupRecognition = useCallback(() => {
    // 1. Check Secure Context (HTTPS) - Mobile Requirement
    if (typeof window !== 'undefined' && window.isSecureContext === false && window.location.hostname !== 'localhost' && !window.location.hostname.startsWith('127.0.0.')) {
      onStatusChange('Lỗi: Cần chạy trên HTTPS (hoặc localhost) để dùng Microphone');
      return false;
    }

    const SpeechRecognitionCtor =
      (window as SpeechRecognitionWindow).SpeechRecognition ||
      (window as SpeechRecognitionWindow).webkitSpeechRecognition;

    if (!SpeechRecognitionCtor) {
      onStatusChange('Trình duyệt không hỗ trợ nhận diện giọng nói');
      return false;
    }

    recognitionRef.current = new SpeechRecognitionCtor();
    recognitionRef.current.lang = 'vi-VN';
    recognitionRef.current.continuous = true;
    recognitionRef.current.interimResults = true;

    // Mobile often needs maxAlternatives to be 1
    (recognitionRef.current as any).maxAlternatives = 1;

    // --- Enhanced Mobile Debugging Events ---
    (recognitionRef.current as any).onaudiostart = () => {
      console.log('Audio Context started');
      // Chỉ update status nếu đang không xử lý gì quan trọng
      if (!isProcessingRef.current) {
        // onStatusChange('Đã kết nối micro...'); // Optional: ồn ào quá thì comment
      }
    };

    (recognitionRef.current as any).onsoundstart = () => {
      console.log('Sound detected');
    };

    (recognitionRef.current as any).onspeechstart = () => {
      console.log('Speech detected');
    };
    // ----------------------------------------

    recognitionRef.current.onstart = () => {
      console.log('Speech recognition started');
      setIsListening?.(true);
      onStatusChange('Đang nghe...');
    };

    recognitionRef.current.onend = () => {
      console.log('Speech recognition ended');
      setIsListening?.(false);
      onStatusChange('Đã dừng nghe');

      // ✅ dùng isProcessingRef để không bị stale
      if (
        shouldAutoListenRef.current &&
        recognitionRef.current &&
        !isProcessingRef.current &&
        !isSpeaking()
      ) {
        console.log('Auto-restarting recognition (Mobile fix: waiting longer)...');
        // Mobile (Android Chrome) safe restart delay is >300ms. 
        setTimeout(() => {
          if (
            shouldAutoListenRef.current &&
            recognitionRef.current &&
            !isProcessingRef.current &&
            !isSpeaking()
          ) {
            safeStartRecognition();
          }
        }, 500);
      }
    };

    recognitionRef.current.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.log('Speech recognition error:', event.error);

      if (event.error === 'no-speech') {
        // Normal on mobile if silence. Just let onend restart it.
        onStatusChange('Không nghe thấy gì...');
      } else if (event.error === 'not-allowed') {
        onStatusChange('Lỗi: Bạn đã chặn Micro. Hãy cho phép trong cài đặt trình duyệt.');
      } else if (event.error === 'network') {
        onStatusChange('Lỗi mạng: Kiểm tra kết nối internet.');
      } else if (event.error === 'aborted') {
        // Ignore aborted user action
      } else {
        onStatusChange('Lỗi: ' + event.error);
      }
    };

    recognitionRef.current.onresult = (event: SpeechRecognitionEvent) => {
      let finalTranscript = '';
      let interimTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        const isFinal = event.results[i].isFinal;

        if (isFinal) finalTranscript += transcript + ' ';
        else interimTranscript += transcript;
      }

      const text = (finalTranscript || interimTranscript || '').trim();
      if (!text) return;

      // ✅ Nếu đang xử lý hoặc TTS đang chạy -> bỏ qua
      if (isProcessingRef.current || isSpeaking()) return;

      // =========================
      // 1) Trigger: chỉ check trên FINAL (fix mobile kẹt + giảm double-fire)
      // =========================
      // =========================
      // 1) Trigger: Check cả FINAL và INTERIM để phản hồi ngay lập tức
      // =========================
      if (waitingForTriggerRef.current) {
        // Check interim trước cho nhanh
        const interimNormalized = normalizeVN(interimTranscript);
        if (containsTriggerWord(interimNormalized)) {
          // Found trigger in interim!
          onTriggerWord();
          return;
        }

        const finalText = finalTranscript.trim();
        if (finalText) {
          const normalized = normalizeVN(finalText);

          // chống final lặp (chỉ chặn nếu < 1s)
          const now = Date.now();
          if (normalized &&
            normalized === lastFinalNormalizedRef.current &&
            now - lastFinalTimeRef.current < 1000
          ) {
            return;
          }
          if (normalized) {
            lastFinalNormalizedRef.current = normalized;
            lastFinalTimeRef.current = now;
          }

          if (containsTriggerWord(finalText)) {
            onTriggerWord();
            return;
          }
        }

        onStatusChange('Nghe được: ' + text + ' (chờ "bạn ơi!")');
        return;
      }

      // =========================
      // 2) Request: chỉ xử lý khi có FINAL đủ dài
      // =========================
      // =========================
      // 2) Request: chỉ xử lý khi có FINAL đủ dài
      // =========================
      if (!waitingForTriggerRef.current && waitingForRequestRef.current) {
        const finalText = finalTranscript.trim();

        if (finalText) {
          const normalized = normalizeVN(finalText);

          // chống final lặp
          const now = Date.now();
          if (normalized &&
            normalized === lastFinalNormalizedRef.current &&
            now - lastFinalTimeRef.current < 1000
          ) {
            return;
          }
          if (normalized) {
            lastFinalNormalizedRef.current = normalized;
            lastFinalTimeRef.current = now;
          }

          // anti-feedback: tránh bắt lại ngay sau khi TTS kết thúc
          // now already accepted from above
          if (now - lastTTSEndTimeRef.current < 1000) return;

          // Xử lý compound command: "bạn ơi [request]"
          // Nếu người dùng nói liền: "Bạn ơi cho tôi hỏi cái này" -> trigger word nằm trong chính request
          // Cần strip trigger word ra
          let cleanText = finalText;
          if (containsTriggerWord(cleanText)) {
            // Remove "ban oi" variants
            // Simple strip strategy: split by common triggers
            const triggers = ["ban oi", "ba oi", "ba noi", "bac oi", "bang oi", "ban noi", "hey you"];
            const norm = normalizeVN(cleanText);

            // Tìm trigger nào match và remove
            // Lưu ý: đây là strip trên normalized text, nhưng ta cần text gốc để gửi backend (có dấu)
            // Cách đơn giản nhất: Nếu normalized startwith trigger -> slice text gốc tương ứng
            // Tuy nhiên text gốc tiếng Việt có dấu khác độ dài.
            // -> Fallback: Nếu câu chứa trigger, ta cứ gửi cả câu cho backend (backend AI hiểu được), 
            // nhưng quan trọng là ĐỪNG CHẶN nó.

            // Logic cũ: "Vui lòng nói yêu cầu, không cần nói 'bạn ơi!' nữa" -> CHẶN
            // Logic mới: Cứ nhận luôn!
          }

          // yêu cầu tối thiểu 2 từ (nếu chưa strip)
          // hoặc nếu strip rồi thì cũng cần check lại
          if (finalText.split(/\s+/).length >= 2) {
            if (now - lastCaptureTimeRef.current > 1500) {
              lastCaptureTimeRef.current = now;
              onUserRequest(finalText); // gửi cả "bạn ơi..." backend AI sẽ tự hiểu
              return;
            }
          }

          onStatusChange('Nghe được: ' + finalText);
          return;
        }

        // chưa có final -> chỉ hiển thị interim
        onStatusChange('Nghe được: ' + text);
        return;
      }

      // =========================
      // 3) Không ở mode trigger/request -> đừng spam “đang xử lý”
      // =========================
      // Thay vì set status liên tục, chỉ log nhẹ
      console.log('Not in trigger/request mode, ignoring speech');
    };

    return true;
  }, [onStatusChange, setIsListening, onTriggerWord, onUserRequest]);

  const startListening = useCallback(async () => {
    // 1. Unlock audio on user interaction (mobile requirement)
    unlockAudio();

    if (!recognitionRef.current) {
      const success = setupRecognition();
      if (!success) return;
    }

    try {
      // ✅ REMOVED explicit getUserMedia call.
      // SpeechRecognition handles permission internally.
      // Calling getUserMedia separately causes issues on iOS/Android (stops recognition or conflicts).

      shouldAutoListenRef.current = true;

      // reset anti-dup
      lastFinalNormalizedRef.current = '';

      safeStartRecognition();
    } catch (err) {
      console.error('Error starting listening:', err);
      throw new Error('Vui lòng cho phép sử dụng microphone');
    }
  }, [setupRecognition]);

  const stopListening = useCallback(() => {
    shouldAutoListenRef.current = false;
    if (recognitionRef.current) {
      try {
        // ✅ abort ổn định hơn stop trên Chrome/mobile
        (recognitionRef.current as any).abort?.();
      } catch { }
      try { recognitionRef.current.stop(); } catch { }
    }
  }, []);

  const restartListening = useCallback(() => {
    console.log('Restarting listening manually...');
    shouldAutoListenRef.current = true;
    if (recognitionRef.current && !isProcessing && !isSpeaking()) {
      setTimeout(() => {
        if (shouldAutoListenRef.current && recognitionRef.current && !isProcessing && !isSpeaking()) {
          try {
            recognitionRef.current.start();
            console.log('Speech recognition manually restarted');
          } catch (err) {
            console.log('Failed to manually restart speech recognition:', err);
          }
        }
      }, 1000);
    }
  }, [isProcessing]);

  return {
    recognitionRef,
    shouldAutoListenRef,
    setupRecognition,
    startListening,
    stopListening,
    // nếu bạn cần sync lastTTSEndTimeRef từ ngoài thì expose thêm:
    lastTTSEndTimeRef
  };
};
