import { useRef, useCallback, useEffect } from 'react';
import {
  containsTriggerWord,
  isSpeaking,
  isTriggerOnlyText,
  normalizeVN,
  POST_TTS_RECOGNITION_GUARD_MS,
  REQUEST_AFTER_TRIGGER_DELAY_MS,
  stripLeadingTriggerPhrase,
  unlockAudio,
} from '../utils/speech';

interface UseSpeechRecognitionProps {
  isProcessing: boolean;
  waitingForTrigger: boolean;
  waitingForRequest: boolean;
  onTriggerWord: () => void;
  onUserRequest: (text: string) => void;
  onStatusChange: (status: string) => void;
  setIsListening?: (listening: boolean) => void;
  recognitionRef: React.MutableRefObject<SpeechRecognition | null>;
  shouldAutoListenRef: React.MutableRefObject<boolean>;
  lastTTSEndTimeRef: React.MutableRefObject<number>;
}

const isDuplicateFinal = (
  normalized: string,
  now: number,
  lastFinalNormalizedRef: React.MutableRefObject<string>,
  lastFinalTimeRef: React.MutableRefObject<number>
) => {
  if (
    normalized &&
    normalized === lastFinalNormalizedRef.current &&
    now - lastFinalTimeRef.current < 1000
  ) {
    return true;
  }

  if (normalized) {
    lastFinalNormalizedRef.current = normalized;
    lastFinalTimeRef.current = now;
  }

  return false;
};

export const useSpeechRecognition = ({
  isProcessing,
  waitingForTrigger,
  waitingForRequest,
  onTriggerWord,
  onUserRequest,
  onStatusChange,
  setIsListening,
  recognitionRef,
  shouldAutoListenRef,
  lastTTSEndTimeRef,
}: UseSpeechRecognitionProps) => {
  const lastCaptureTimeRef = useRef(0);
  const waitingForTriggerRef = useRef(waitingForTrigger);
  const waitingForRequestRef = useRef(waitingForRequest);
  const isProcessingRef = useRef(isProcessing);
  const lastFinalNormalizedRef = useRef('');
  const lastFinalTimeRef = useRef(0);
  const triggerWordDetectedTimeRef = useRef(0);

  waitingForTriggerRef.current = waitingForTrigger;
  waitingForRequestRef.current = waitingForRequest;
  isProcessingRef.current = isProcessing;

  useEffect(() => {
    if (waitingForTrigger) {
      triggerWordDetectedTimeRef.current = 0;
    }
  }, [waitingForTrigger]);

  const safeStartRecognition = useCallback(() => {
    if (!recognitionRef.current) return;

    try {
      recognitionRef.current.start();
    } catch {
      // Ignore InvalidStateError when browser starts too quickly.
    }
  }, [recognitionRef]);

  const setupRecognition = useCallback(() => {
    if (
      typeof window !== 'undefined' &&
      window.isSecureContext === false &&
      window.location.hostname !== 'localhost' &&
      !window.location.hostname.startsWith('127.0.0.')
    ) {
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
    recognitionRef.current.maxAlternatives = 1;

    recognitionRef.current.onaudiostart = () => {
      console.log('Audio Context started');
    };

    recognitionRef.current.onsoundstart = () => {
      console.log('Sound detected');
    };

    recognitionRef.current.onspeechstart = () => {
      console.log('Speech detected');
    };

    recognitionRef.current.onstart = () => {
      console.log('Speech recognition started');
      setIsListening?.(true);
      onStatusChange('Đang nghe...');
    };

    recognitionRef.current.onend = () => {
      console.log('Speech recognition ended');
      setIsListening?.(false);
      onStatusChange('Đã dừng nghe');

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
        }, 500);
      }
    };

    recognitionRef.current.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.log('Speech recognition error:', event.error);

      if (event.error === 'no-speech') {
        onStatusChange('Không nghe thấy gì...');
      } else if (event.error === 'not-allowed') {
        onStatusChange('Lỗi: Bạn đã chặn Micro. Hãy cho phép trong cài đặt trình duyệt.');
      } else if (event.error === 'network') {
        onStatusChange('Lỗi mạng: Kiểm tra kết nối internet.');
      } else if (event.error !== 'aborted') {
        onStatusChange('Lỗi: ' + event.error);
      }
    };

    recognitionRef.current.onresult = (event: SpeechRecognitionEvent) => {
      let finalTranscript = '';
      let interimTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript + ' ';
        } else {
          interimTranscript += transcript;
        }
      }

      const text = (finalTranscript || interimTranscript || '').trim();
      if (!text) return;
      if (isProcessingRef.current || isSpeaking()) return;

      if (waitingForTriggerRef.current) {
        const finalText = finalTranscript.trim();
        if (finalText) {
          const normalized = normalizeVN(finalText);
          const now = Date.now();

          if (isDuplicateFinal(normalized, now, lastFinalNormalizedRef, lastFinalTimeRef)) {
            return;
          }

          if (containsTriggerWord(finalText)) {
            const immediateRequest = stripLeadingTriggerPhrase(finalText);
            if (immediateRequest && immediateRequest.split(/\s+/).length >= 2) {
              lastCaptureTimeRef.current = now;
              triggerWordDetectedTimeRef.current = 0;
              onStatusChange('Đã nghe yêu cầu, đang xử lý...');
              onUserRequest(immediateRequest);
              return;
            }

            triggerWordDetectedTimeRef.current = now;
            onTriggerWord();
            return;
          }
        }

        onStatusChange('Nghe được: ' + text + ' (chờ "bạn ơi!")');
        return;
      }

      if (!waitingForTriggerRef.current && waitingForRequestRef.current) {
        const finalText = finalTranscript.trim();

        if (!finalText) {
          onStatusChange('Nghe được: ' + text);
          return;
        }

        const normalized = normalizeVN(finalText);
        const now = Date.now();

        if (isDuplicateFinal(normalized, now, lastFinalNormalizedRef, lastFinalTimeRef)) {
          return;
        }

        if (now - lastTTSEndTimeRef.current < POST_TTS_RECOGNITION_GUARD_MS) {
          onStatusChange('Đang sẵn sàng lại sau khi đọc xong...');
          return;
        }

        const timeSinceTrigger =
          triggerWordDetectedTimeRef.current > 0
            ? now - triggerWordDetectedTimeRef.current
            : Infinity;

        if (timeSinceTrigger < REQUEST_AFTER_TRIGGER_DELAY_MS) {
          onStatusChange('Nghe được: ' + finalText + ' (đang chờ...)');
          return;
        }

        const strippedText = stripLeadingTriggerPhrase(finalText);
        const requestText =
          strippedText !== finalText.trim() ? strippedText : finalText.trim();

        if (!requestText || isTriggerOnlyText(finalText)) {
          onStatusChange('Đã nghe "bạn ơi", hãy nói yêu cầu của bạn...');
          return;
        }

        if (requestText.split(/\s+/).length >= 2) {
          if (now - lastCaptureTimeRef.current > 1500) {
            lastCaptureTimeRef.current = now;
            triggerWordDetectedTimeRef.current = 0;
            onUserRequest(requestText);
            return;
          }
        }

        onStatusChange('Nghe được: ' + requestText);
        return;
      }

      console.log('Not in trigger/request mode, ignoring speech');
    };

    return true;
  }, [
    onStatusChange,
    onTriggerWord,
    onUserRequest,
    recognitionRef,
    safeStartRecognition,
    setIsListening,
    shouldAutoListenRef,
    lastTTSEndTimeRef,
  ]);

  const startListening = useCallback(async () => {
    unlockAudio();

    if (!recognitionRef.current) {
      const success = setupRecognition();
      if (!success) return;
    }

    shouldAutoListenRef.current = true;
    lastFinalNormalizedRef.current = '';
    safeStartRecognition();
  }, [recognitionRef, safeStartRecognition, setupRecognition, shouldAutoListenRef]);

  const stopListening = useCallback(() => {
    shouldAutoListenRef.current = false;
    if (!recognitionRef.current) return;

    try {
      recognitionRef.current.abort?.();
    } catch {}

    try {
      recognitionRef.current.stop();
    } catch {}
  }, [recognitionRef, shouldAutoListenRef]);

  const restartListening = useCallback(() => {
    console.log('Restarting listening manually...');
    shouldAutoListenRef.current = true;

    if (recognitionRef.current && !isProcessing && !isSpeaking()) {
      setTimeout(() => {
        if (
          shouldAutoListenRef.current &&
          recognitionRef.current &&
          !isProcessing &&
          !isSpeaking()
        ) {
          try {
            recognitionRef.current.start();
            console.log('Speech recognition manually restarted');
          } catch (error) {
            console.log('Failed to manually restart speech recognition:', error);
          }
        }
      }, POST_TTS_RECOGNITION_GUARD_MS);
    }
  }, [isProcessing, recognitionRef, shouldAutoListenRef]);

  return {
    setupRecognition,
    startListening,
    stopListening,
    restartListening,
  };
};
