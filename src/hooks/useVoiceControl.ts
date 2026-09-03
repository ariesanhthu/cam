import { useState, useCallback, useRef } from 'react';
import { Settings } from '../types';
import { captureFromDeviceCamera, fetchImageFromBackend } from '../utils/camera';
import { sendToBackend } from '../utils/backend';
import { speakResult, speakText, type SpeakSettings } from '../utils/speech';

const REQUEST_TIMEOUT_MS = 15000;

interface UseVoiceControlProps {
  settings: Settings;
  showNotification: (message: string, type?: 'success' | 'error') => void;
  setStatus: (status: string) => void;
  recognitionRef: React.RefObject<SpeechRecognition | null>;
  shouldAutoListenRef: React.MutableRefObject<boolean>;
  lastTTSEndTimeRef: React.MutableRefObject<number>;
}

export const useVoiceControl = ({
  settings,
  showNotification,
  setStatus,
  recognitionRef,
  shouldAutoListenRef,
  lastTTSEndTimeRef,
}: UseVoiceControlProps) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [waitingForTrigger, setWaitingForTrigger] = useState(true);
  const [waitingForRequest, setWaitingForRequest] = useState(false);
  const [currentRequest, setCurrentRequest] = useState('');

  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const stopRecognitionSafe = useCallback(() => {
    if (!recognitionRef.current) return;

    try {
      recognitionRef.current.abort?.();
    } catch {}

    try {
      recognitionRef.current.stop();
    } catch {}
  }, [recognitionRef]);

  const startRecognitionSafe = useCallback(() => {
    if (!recognitionRef.current) return;

    try {
      recognitionRef.current.start();
    } catch {}
  }, [recognitionRef]);

  const restartRecognitionLater = useCallback(
    (delayMs: number, logMessage: string) => {
      setTimeout(() => {
        shouldAutoListenRef.current = true;
        startRecognitionSafe();
        console.log(logMessage);
      }, delayMs);
    },
    [shouldAutoListenRef, startRecognitionSafe]
  );

  const clearRequestTimeout = useCallback(() => {
    if (!timeoutRef.current) return;
    clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  }, []);

  const resetToTriggerMode = useCallback((statusText?: string) => {
    setWaitingForTrigger(true);
    setWaitingForRequest(false);
    setCurrentRequest('');
    setStatus(statusText ?? 'Hoàn tất! Hãy nói "bạn ơi!" để tiếp tục...');
  }, [setStatus]);

  const handleUserRequest = useCallback(
    async (promptText: string) => {
      console.log('handleUserRequest called with:', promptText);
      console.log('Current settings:', settings);

      clearRequestTimeout();

      setIsProcessing(true);
      setWaitingForRequest(false);
      setStatus('Đang xử lý yêu cầu: ' + promptText);
      showNotification('Đang xử lý yêu cầu...');

      shouldAutoListenRef.current = false;
      stopRecognitionSafe();

      try {
        let blob: Blob | null = null;

        if (settings.useDeviceCamera) {
          blob = await captureFromDeviceCamera();
          showNotification('Đã chụp ảnh từ thiết bị');
          setStatus('Chụp ảnh từ thiết bị thành công');
        } else {
          blob = await fetchImageFromBackend(settings.backendUrl);
        }

        setStatus('Đang gửi đến server...');
        console.log('Sending to backend:', {
          blob: blob ? 'has blob' : 'no blob',
          promptText,
          backendUrl: settings.backendUrl,
        });

        const result = await sendToBackend(blob, promptText, settings);
        console.log('Backend response:', result);

        if (!result) {
          setStatus('Không nhận được kết quả từ server');
          showNotification('Không nhận được kết quả từ server', 'error');
          resetToTriggerMode('Không nhận được kết quả. Hãy nói "bạn ơi!" để thử lại...');
          restartRecognitionLater(1200, 'Speech recognition restarted after empty result');
          return;
        }

        setStatus('Đã nhận kết quả');

        if (settings.speak) {
          const speakSettings: SpeakSettings = {
            voiceRate: settings.voiceRate,
            voiceVolume: settings.voiceVolume,
            ttsProvider: settings.ttsProvider,
            language: settings.language,
            zaloSpeakerId: settings.zaloSpeakerId,
            zaloSpeed: settings.zaloSpeed,
            zaloEncodeType: settings.zaloEncodeType,
          };

          await speakResult(
            result,
            speakSettings,
            () => setStatus('Đang đọc kết quả...'),
            () => {
              resetToTriggerMode('Hoàn tất! Hãy nói "bạn ơi!" để tiếp tục...');
            },
            recognitionRef,
            shouldAutoListenRef,
            lastTTSEndTimeRef
          );
          return;
        }

        setStatus('Hoàn tất! Hãy nói "bạn ơi!" để tiếp tục...');
        restartRecognitionLater(1200, 'Speech recognition restarted after processing (no TTS)');

        resetToTriggerMode('Hoàn tất! Hãy nói "bạn ơi!" để tiếp tục...');
      } catch (error: unknown) {
        console.error('Error in handleUserRequest:', error);
        const message = error instanceof Error ? error.message : 'Unknown error';
        showNotification('Lỗi xử lý: ' + message, 'error');
        setStatus('Lỗi xử lý: ' + message);

        resetToTriggerMode('Có lỗi. Hãy nói "bạn ơi!" để thử lại...');
        restartRecognitionLater(1000, 'Speech recognition restarted after error');
      } finally {
        setIsProcessing(false);
      }
    },
    [
      clearRequestTimeout,
      lastTTSEndTimeRef,
      recognitionRef,
      resetToTriggerMode,
      restartRecognitionLater,
      settings,
      setStatus,
      shouldAutoListenRef,
      showNotification,
      stopRecognitionSafe,
    ]
  );

  const handleTriggerWord = useCallback(() => {
    setWaitingForTrigger(false);
    setWaitingForRequest(true);
    setStatus('Hãy nói yêu cầu của bạn...');
    showNotification('Đã nghe "bạn ơi!", hãy nói yêu cầu...');

    clearRequestTimeout();

    const startTimeout = () => {
      clearRequestTimeout();
      timeoutRef.current = setTimeout(() => {
        resetToTriggerMode('Hãy nói "bạn ơi!" để bắt đầu...');
        showNotification('Hết thời gian chờ, hãy nói "bạn ơi!" lại');
        timeoutRef.current = null;
      }, REQUEST_TIMEOUT_MS);
    };

    if (settings.speak) {
      const speakSettings: SpeakSettings = {
        voiceRate: settings.voiceRate,
        voiceVolume: settings.voiceVolume,
        ttsProvider: settings.ttsProvider,
        language: settings.language,
        zaloSpeakerId: settings.zaloSpeakerId,
        zaloSpeed: settings.zaloSpeed,
        zaloEncodeType: settings.zaloEncodeType,
      };

      void speakText(
        settings.language === 'en' ? 'How can I help you?' : 'Bạn cần giúp gì?',
        speakSettings,
        recognitionRef,
        shouldAutoListenRef,
        lastTTSEndTimeRef,
        undefined,
        startTimeout
      );
    } else {
      startTimeout();
    }
  }, [
    clearRequestTimeout,
    lastTTSEndTimeRef,
    recognitionRef,
    resetToTriggerMode,
    settings,
    setStatus,
    shouldAutoListenRef,
    showNotification,
  ]);

  return {
    isProcessing,
    waitingForTrigger,
    waitingForRequest,
    currentRequest,
    setCurrentRequest,
    handleUserRequest,
    handleTriggerWord,
  };
};
