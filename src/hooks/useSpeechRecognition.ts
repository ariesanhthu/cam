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

const REQUEST_CAPTURE_COOLDOWN_MS = 1500;
const INTERIM_REQUEST_COMMIT_DELAY_MS = 1400;

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
}: UseSpeechRecognitionProps) => {
  const lastCaptureTimeRef = useRef(0);
  const waitingForTriggerRef = useRef(waitingForTrigger);
  const waitingForRequestRef = useRef(waitingForRequest);
  const isProcessingRef = useRef(isProcessing);
  const onTriggerWordRef = useRef(onTriggerWord);
  const onUserRequestRef = useRef(onUserRequest);
  const onStatusChangeRef = useRef(onStatusChange);
  const lastFinalNormalizedRef = useRef('');
  const lastFinalTimeRef = useRef(0);
  const triggerWordDetectedTimeRef = useRef(0);
  const pendingRequestTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRequestTextRef = useRef('');

  waitingForTriggerRef.current = waitingForTrigger;
  waitingForRequestRef.current = waitingForRequest;
  isProcessingRef.current = isProcessing;
  onTriggerWordRef.current = onTriggerWord;
  onUserRequestRef.current = onUserRequest;
  onStatusChangeRef.current = onStatusChange;

  useEffect(() => {
    if (waitingForTrigger) {
      triggerWordDetectedTimeRef.current = 0;
      pendingRequestTextRef.current = '';
      if (pendingRequestTimerRef.current) {
        clearTimeout(pendingRequestTimerRef.current);
        pendingRequestTimerRef.current = null;
      }
    }
  }, [waitingForTrigger]);

  useEffect(() => {
    return () => {
      if (pendingRequestTimerRef.current) {
        clearTimeout(pendingRequestTimerRef.current);
      }
    };
  }, []);

  const clearPendingRequestCommit = useCallback(() => {
    if (pendingRequestTimerRef.current) {
      clearTimeout(pendingRequestTimerRef.current);
      pendingRequestTimerRef.current = null;
    }

    pendingRequestTextRef.current = '';
  }, []);

  const buildRequestText = useCallback((rawText: string) => {
    const trimmedText = rawText.trim();
    const strippedText = stripLeadingTriggerPhrase(trimmedText);
    return strippedText !== trimmedText ? strippedText : trimmedText;
  }, []);

  const submitRequestCandidate = useCallback(
    (rawText: string, source: 'final' | 'interim-pause') => {
      const now = Date.now();
      const finalText = rawText.trim();
      const requestText = buildRequestText(finalText);
      const timeSinceTrigger =
        triggerWordDetectedTimeRef.current > 0
          ? now - triggerWordDetectedTimeRef.current
          : Infinity;

      console.log('[voice] request candidate:', {
        source,
        finalText,
        requestText,
        timeSinceTrigger,
        waitingForRequest: waitingForRequestRef.current,
        isProcessing: isProcessingRef.current,
      });

      if (
        !finalText ||
        !waitingForRequestRef.current ||
        waitingForTriggerRef.current ||
        isProcessingRef.current ||
        isSpeaking()
      ) {
        return false;
      }

      if (timeSinceTrigger < REQUEST_AFTER_TRIGGER_DELAY_MS) {
        onStatusChangeRef.current('Nghe được: ' + finalText + ' (đang chờ...)');
        return false;
      }

      if (!requestText || isTriggerOnlyText(finalText)) {
        onStatusChangeRef.current('Đã nghe "bạn ơi", hãy nói yêu cầu của bạn...');
        return false;
      }

      if (now - lastCaptureTimeRef.current <= REQUEST_CAPTURE_COOLDOWN_MS) {
        onStatusChangeRef.current('Nghe được: ' + requestText);
        return false;
      }

      clearPendingRequestCommit();
      lastCaptureTimeRef.current = now;
      triggerWordDetectedTimeRef.current = 0;
      waitingForRequestRef.current = false;
      isProcessingRef.current = true;
      onStatusChangeRef.current('Đã nghe yêu cầu, đang xử lý...');
      console.log('[voice] submitting user request:', { source, requestText });
      onUserRequestRef.current(requestText);
      return true;
    },
    [buildRequestText, clearPendingRequestCommit]
  );

  const schedulePendingRequestCommit = useCallback(
    (rawText: string) => {
      const requestText = buildRequestText(rawText);

      if (!requestText || isTriggerOnlyText(rawText)) {
        clearPendingRequestCommit();
        onStatusChangeRef.current('Đã nghe "bạn ơi", hãy nói yêu cầu của bạn...');
        return;
      }

      if (pendingRequestTimerRef.current) {
        clearTimeout(pendingRequestTimerRef.current);
      }

      pendingRequestTextRef.current = rawText;
      onStatusChangeRef.current('Nghe được: ' + requestText + ' (đợi bạn nói xong...)');
      console.log('[voice] scheduled interim request commit:', {
        requestText,
        delayMs: INTERIM_REQUEST_COMMIT_DELAY_MS,
      });

      pendingRequestTimerRef.current = setTimeout(() => {
        const pendingText = pendingRequestTextRef.current;
        pendingRequestTimerRef.current = null;
        pendingRequestTextRef.current = '';
        submitRequestCandidate(pendingText, 'interim-pause');
      }, INTERIM_REQUEST_COMMIT_DELAY_MS);
    },
    [buildRequestText, clearPendingRequestCommit, submitRequestCandidate]
  );

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
      onStatusChangeRef.current('Lỗi: Cần chạy trên HTTPS (hoặc localhost) để dùng Microphone');
      return false;
    }

    const SpeechRecognitionCtor =
      (window as SpeechRecognitionWindow).SpeechRecognition ||
      (window as SpeechRecognitionWindow).webkitSpeechRecognition;

    if (!SpeechRecognitionCtor) {
      onStatusChangeRef.current('Trình duyệt không hỗ trợ nhận diện giọng nói');
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
      onStatusChangeRef.current('Đang nghe...');
    };

    recognitionRef.current.onend = () => {
      console.log('Speech recognition ended');
      setIsListening?.(false);

      if (!isSpeaking()) {
        onStatusChangeRef.current('Đã dừng nghe');
      }

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
        onStatusChangeRef.current('Không nghe thấy gì...');
      } else if (event.error === 'not-allowed') {
        onStatusChangeRef.current('Lỗi: Bạn đã chặn Micro. Hãy cho phép trong cài đặt trình duyệt.');
      } else if (event.error === 'network') {
        onStatusChangeRef.current('Lỗi mạng: Kiểm tra kết nối internet.');
      } else if (event.error !== 'aborted') {
        onStatusChangeRef.current('Lỗi: ' + event.error);
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
        const interimText = interimTranscript.trim();
        if (interimText && containsTriggerWord(interimText)) {
          const now = Date.now();
          clearPendingRequestCommit();
          triggerWordDetectedTimeRef.current = now;
          waitingForTriggerRef.current = false;
          waitingForRequestRef.current = true;
          lastFinalNormalizedRef.current = '';
          lastFinalTimeRef.current = 0;
          onTriggerWordRef.current();
          return;
        }

        const finalText = finalTranscript.trim();
        if (finalText) {
          const normalized = normalizeVN(finalText);
          const now = Date.now();

          if (isDuplicateFinal(normalized, now, lastFinalNormalizedRef, lastFinalTimeRef)) {
            return;
          }

          if (containsTriggerWord(finalText)) {
            clearPendingRequestCommit();
            triggerWordDetectedTimeRef.current = now;
            waitingForTriggerRef.current = false;
            waitingForRequestRef.current = true;
            lastFinalNormalizedRef.current = '';
            lastFinalTimeRef.current = 0;
            onTriggerWordRef.current();
            return;
          }
        }

        onStatusChangeRef.current('Nghe được: ' + text + ' (chờ "bạn ơi!")');
        return;
      }

      if (!waitingForTriggerRef.current && waitingForRequestRef.current) {
        const finalText = finalTranscript.trim();
        const interimText = interimTranscript.trim();

        if (!finalText) {
          if (interimText) {
            schedulePendingRequestCommit(interimText);
          }
          return;
        }

        const normalized = normalizeVN(finalText);
        const now = Date.now();

        if (isDuplicateFinal(normalized, now, lastFinalNormalizedRef, lastFinalTimeRef)) {
          return;
        }

        if (submitRequestCandidate(finalText, 'final')) {
          return;
        }

        schedulePendingRequestCommit(finalText);
        return;
      }

      console.log('Not in trigger/request mode, ignoring speech');
    };

    return true;
  }, [
    clearPendingRequestCommit,
    recognitionRef,
    safeStartRecognition,
    schedulePendingRequestCommit,
    setIsListening,
    shouldAutoListenRef,
    submitRequestCandidate,
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
