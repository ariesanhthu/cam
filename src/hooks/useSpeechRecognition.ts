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
}

export const useSpeechRecognition = ({
  isProcessing,
  waitingForTrigger,
  waitingForRequest,
  onTriggerWord,
  onUserRequest,
  onStatusChange,
  setIsListening
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

  // Track khi TTS kết thúc (nếu bạn set từ ngoài, giữ ref này để đồng bộ)
  const lastTTSEndTimeRef = useRef(0);

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
        console.log('Auto-restarting recognition...');
        setTimeout(() => {
          if (
            shouldAutoListenRef.current &&
            recognitionRef.current &&
            !isProcessingRef.current &&
            !isSpeaking()
          ) {
            safeStartRecognition();
          }
        }, 350); // ✅ Chrome/mobile cần delay ngắn để tránh start quá nhanh
      }
    };

    recognitionRef.current.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.log('Speech recognition error:', event.error);
      if (event.error === 'no-speech') {
        onStatusChange('Không nghe thấy giọng nói');
      } else if (event.error === 'not-allowed') {
        onStatusChange('Vui lòng cho phép sử dụng microphone');
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
      if (waitingForTriggerRef.current) {
        const finalText = finalTranscript.trim();
        if (finalText) {
          const normalized = normalizeVN(finalText);

          // chống final lặp
          if (normalized && normalized === lastFinalNormalizedRef.current) {
            return;
          }
          if (normalized) lastFinalNormalizedRef.current = normalized;

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
      if (!waitingForTriggerRef.current && waitingForRequestRef.current) {
        const finalText = finalTranscript.trim();

        if (finalText) {
          const normalized = normalizeVN(finalText);

          // chống final lặp
          if (normalized && normalized === lastFinalNormalizedRef.current) {
            return;
          }
          if (normalized) lastFinalNormalizedRef.current = normalized;

          // anti-feedback: tránh bắt lại ngay sau khi TTS kết thúc
          const now = Date.now();
          if (now - lastTTSEndTimeRef.current < 2500) return;

          // không cho nói lại “bạn ơi” trong request
          if (containsTriggerWord(finalText)) {
            onStatusChange('Vui lòng nói yêu cầu, không cần nói "bạn ơi!" nữa');
            return;
          }

          // yêu cầu tối thiểu 2 từ
          if (finalText.split(/\s+/).length >= 2) {
            if (now - lastCaptureTimeRef.current > 1500) {
              lastCaptureTimeRef.current = now;
              onUserRequest(finalText);
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
