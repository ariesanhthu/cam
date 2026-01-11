import { useState, useCallback, useRef } from 'react';
import { Settings } from '../types';
import { captureFromDeviceCamera, fetchImageFromSupabaseStorage } from '../utils/camera';
import { sendToBackend } from '../utils/backend';
import { speakResult, speakText } from '../utils/speech';

interface UseVoiceControlProps {
  settings: Settings;
  showNotification: (message: string, type?: 'success' | 'error') => void;
  setStatus: (status: string) => void;
  setIsListening: (listening: boolean) => void; // (bạn đang không dùng, giữ nguyên interface)
  recognitionRef: React.RefObject<SpeechRecognition | null>;
  shouldAutoListenRef: React.MutableRefObject<boolean>;
  lastTTSEndTimeRef: React.MutableRefObject<number>;
  restartListening?: () => void;
}

export const useVoiceControl = ({
  settings,
  showNotification,
  setStatus,
  recognitionRef,
  shouldAutoListenRef,
  lastTTSEndTimeRef,
  restartListening
}: UseVoiceControlProps) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [waitingForTrigger, setWaitingForTrigger] = useState(true);
  const [waitingForRequest, setWaitingForRequest] = useState(false);
  const [currentRequest, setCurrentRequest] = useState('');

  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const stopRecognitionSafe = () => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch { }
    }
  };

  const startRecognitionSafe = () => {
    if (recognitionRef.current) {
      try { recognitionRef.current.start(); } catch { }
    }
  };

  const clearRequestTimeout = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  const resetToTriggerMode = (statusText?: string) => {
    setWaitingForTrigger(true);
    setWaitingForRequest(false);
    setCurrentRequest('');
    setStatus(statusText ?? 'Hoàn tất! Hãy nói "bạn ơi!" để tiếp tục...');
  };

  const handleUserRequest = useCallback(async (promptText: string) => {
    console.log('handleUserRequest called with:', promptText);
    console.log('Current settings:', settings);

    clearRequestTimeout();

    setIsProcessing(true);
    setWaitingForRequest(false);
    setStatus('Đang xử lý yêu cầu: ' + promptText);
    showNotification('Đang xử lý yêu cầu...');

    // Tạm dừng recognition để tránh loop
    shouldAutoListenRef.current = false; // ✅ Fix: Đánh dấu không auto-restart trước khi stop
    stopRecognitionSafe();

    try {
      let blob: Blob | null = null;

      // Luôn đính kèm ảnh
      if (settings.useDeviceCamera) {
        blob = await captureFromDeviceCamera();
        showNotification('Đã chụp ảnh từ thiết bị');
        setStatus('Chụp ảnh từ thiết bị thành công');
      } else {
        blob = await fetchImageFromSupabaseStorage();
      }

      // Send to backend
      setStatus('Đang gửi đến server...');
      console.log('Sending to backend:', { blob: blob ? 'has blob' : 'no blob', promptText, backendUrl: settings.backendUrl });

      const result = await sendToBackend(blob, promptText, settings);
      console.log('Backend response:', result);

      if (!result) {
        setStatus('Không nhận được kết quả từ server');
        showNotification('Không nhận được kết quả từ server', 'error');
        resetToTriggerMode('Không nhận được kết quả. Hãy nói "bạn ơi!" để thử lại...');
        return;
      }

      setStatus('Đã nhận kết quả');

      if (settings.speak) {
        // QUAN TRỌNG:
        // Khi speak=true, speakResult sẽ:
        // - stop recognition
        // - phát TTS (browser hoặc zalo)
        // - set lastTTSEndTimeRef
        // - bật lại auto listen + start recognition (nếu bạn thiết kế như vậy)
        await speakResult(
          result,
          {
            voiceRate: settings.voiceRate,
            voiceVolume: settings.voiceVolume,
            ttsProvider: settings.ttsProvider,
            language: settings.language, // Ngôn ngữ cho cả API và TTS
            zaloSpeakerId: settings.zaloSpeakerId,
            zaloSpeed: settings.zaloSpeed,
            zaloEncodeType: settings.zaloEncodeType,
          } as any,
          () => setStatus('Đang đọc kết quả...'),
          // onEnd:
          () => {
            // TTS xong -> reset về idle
            resetToTriggerMode('Hoàn tất! Hãy nói "bạn ơi!" để tiếp tục...');
          },
          recognitionRef,
          shouldAutoListenRef,
          lastTTSEndTimeRef
        );
        return;
      }

      // Nếu không đọc: tự bật lại nghe
      setStatus('Hoàn tất! Hãy nói "bạn ơi!" để tiếp tục...');
      setTimeout(() => {
        shouldAutoListenRef.current = true;
        startRecognitionSafe();
        console.log('Speech recognition restarted after processing (no TTS)');
      }, 1200);

      resetToTriggerMode('Hoàn tất! Hãy nói "bạn ơi!" để tiếp tục...');
    } catch (err: unknown) {
      console.error('Error in handleUserRequest:', err);
      const msg = err instanceof Error ? err.message : 'Unknown error';
      showNotification('Lỗi xử lý: ' + msg, 'error');
      setStatus('Lỗi xử lý: ' + msg);

      resetToTriggerMode('Có lỗi. Hãy nói "bạn ơi!" để thử lại...');

      // Nếu speak=false mới tự start lại ở đây (tránh double-start nếu speak=true)
      // Nhưng vì speakText/speakResult đã bao bọc try/finally restart,
      // ta chỉ cần lo restart nếu KHÔNG DÙNG TTS
      if (!settings.speak) {
        setTimeout(() => {
          shouldAutoListenRef.current = true;
          startRecognitionSafe();
          console.log('Speech recognition restarted after error (no TTS)');
        }, 1000);
      }
    } finally {
      setIsProcessing(false);
      // Không cần start lại ở đây vì:
      // - Nếu SUCCESS + SPEAK -> speakResult lo
      // - Nếu SUCCESS + NO SPEAK -> setTimeout ở trên lo
      // - Nếu ERROR + SPEAK -> speakResult (trong catch của hàm gọi nó?) -> À khoan, speakResult nằm trong try.
      // -> Nếu error xảy ra TRƯỚC khi gọi speakResult (ví dụ call backend lỗi) -> thì rơi vào catch -> restart manual (nếu no speak). 
      // -> Nếu error xảy ra TRONG speakResult -> speakResult tự restart.
    }
  }, [settings, showNotification, setStatus]); // giữ như bạn: stable dependencies

  const handleTriggerWord = useCallback(() => {
    setWaitingForTrigger(false);

    // ✅ set request mode NGAY LẬP TỨC (fix mobile kẹt)
    setWaitingForRequest(true);
    setStatus('Hãy nói yêu cầu của bạn...');
    showNotification('Đã nghe "bạn ơi!", hãy nói yêu cầu...');

    clearRequestTimeout();

    const armRequestTimeout = (ms: number) => {
      timeoutRef.current = setTimeout(() => {
        setWaitingForTrigger(true);
        setWaitingForRequest(false);
        setStatus('Hãy nói "bạn ơi!" để bắt đầu...');
        showNotification('Hết thời gian chờ, hãy nói "bạn ơi!" lại');
        timeoutRef.current = null;
      }, ms);
    };

    // arm timeout luôn, không phụ thuộc TTS end
    armRequestTimeout(settings.speak ? 7000 : 8000);

    if (settings.speak) {
      // đọc cho UX, nhưng KHÔNG dùng onEnd để “mở request mode” nữa
      speakText(
        settings.language === 'en' ? 'How can I help you?' : 'Bạn cần giúp gì?',
        {
          voiceRate: settings.voiceRate,
          voiceVolume: settings.voiceVolume,
          ttsProvider: settings.ttsProvider,
          language: settings.language, // Ngôn ngữ cho cả API và TTS
          zaloSpeakerId: settings.zaloSpeakerId,
          zaloSpeed: settings.zaloSpeed,
          zaloEncodeType: settings.zaloEncodeType,
        } as any,
        recognitionRef,
        shouldAutoListenRef,
        lastTTSEndTimeRef
      );
    }
  }, [settings, showNotification, setStatus]);

  return {
    isProcessing,
    waitingForTrigger,
    waitingForRequest,
    currentRequest,
    setCurrentRequest,
    handleUserRequest,
    handleTriggerWord
  };
};
