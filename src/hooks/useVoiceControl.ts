import { useState, useCallback, useRef } from 'react';
import { Settings } from '../types';
import { captureFromDeviceCamera, fetchImageFromSupabaseStorage } from '../utils/camera';
import { sendToBackend } from '../utils/backend';
import { speakResult, speakText, type SpeakSettings } from '../utils/speech';

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

  const clearRequestTimeout = useCallback(() => {
    if (!timeoutRef.current) return;
    clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  }, []);

  const resetToTriggerMode = useCallback((statusText?: string) => {
    setWaitingForTrigger(true);
    setWaitingForRequest(false);
    setCurrentRequest('');
    setStatus(statusText ?? 'Hoan tat! Hay noi "ban oi!" de tiep tuc...');
  }, [setStatus]);

  const handleUserRequest = useCallback(
    async (promptText: string) => {
      console.log('handleUserRequest called with:', promptText);
      console.log('Current settings:', settings);

      clearRequestTimeout();

      setIsProcessing(true);
      setWaitingForRequest(false);
      setStatus('Dang xu ly yeu cau: ' + promptText);
      showNotification('Dang xu ly yeu cau...');

      shouldAutoListenRef.current = false;
      stopRecognitionSafe();

      try {
        let blob: Blob | null = null;

        if (settings.useDeviceCamera) {
          blob = await captureFromDeviceCamera();
          showNotification('Da chup anh tu thiet bi');
          setStatus('Chup anh tu thiet bi thanh cong');
        } else {
          blob = await fetchImageFromSupabaseStorage();
        }

        setStatus('Dang gui den server...');
        console.log('Sending to backend:', {
          blob: blob ? 'has blob' : 'no blob',
          promptText,
          backendUrl: settings.backendUrl,
        });

        const result = await sendToBackend(blob, promptText, settings);
        console.log('Backend response:', result);

        if (!result) {
          setStatus('Khong nhan duoc ket qua tu server');
          showNotification('Khong nhan duoc ket qua tu server', 'error');
          resetToTriggerMode('Khong nhan duoc ket qua. Hay noi "ban oi!" de thu lai...');
          return;
        }

        setStatus('Da nhan ket qua');

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
            () => setStatus('Dang doc ket qua...'),
            () => {
              resetToTriggerMode('Hoan tat! Hay noi "ban oi!" de tiep tuc...');
            },
            recognitionRef,
            shouldAutoListenRef,
            lastTTSEndTimeRef
          );
          return;
        }

        setStatus('Hoan tat! Hay noi "ban oi!" de tiep tuc...');
        setTimeout(() => {
          shouldAutoListenRef.current = true;
          startRecognitionSafe();
          console.log('Speech recognition restarted after processing (no TTS)');
        }, 1200);

        resetToTriggerMode('Hoan tat! Hay noi "ban oi!" de tiep tuc...');
      } catch (error: unknown) {
        console.error('Error in handleUserRequest:', error);
        const message = error instanceof Error ? error.message : 'Unknown error';
        showNotification('Loi xu ly: ' + message, 'error');
        setStatus('Loi xu ly: ' + message);

        resetToTriggerMode('Co loi. Hay noi "ban oi!" de thu lai...');

        if (!settings.speak) {
          setTimeout(() => {
            shouldAutoListenRef.current = true;
            startRecognitionSafe();
            console.log('Speech recognition restarted after error (no TTS)');
          }, 1000);
        }
      } finally {
        setIsProcessing(false);
      }
    },
    [
      clearRequestTimeout,
      lastTTSEndTimeRef,
      recognitionRef,
      resetToTriggerMode,
      settings,
      setStatus,
      shouldAutoListenRef,
      showNotification,
      startRecognitionSafe,
      stopRecognitionSafe,
    ]
  );

  const handleTriggerWord = useCallback(() => {
    setWaitingForTrigger(false);
    setWaitingForRequest(true);
    setStatus('Hay noi yeu cau cua ban...');
    showNotification('Da nghe "ban oi!", hay noi yeu cau...');

    clearRequestTimeout();

    timeoutRef.current = setTimeout(() => {
      setWaitingForTrigger(true);
      setWaitingForRequest(false);
      setStatus('Hay noi "ban oi!" de bat dau...');
      showNotification('Het thoi gian cho, hay noi "ban oi!" lai');
      timeoutRef.current = null;
    }, settings.speak ? 7000 : 8000);

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
        settings.language === 'en' ? 'How can I help you?' : 'Ban can giup gi?',
        speakSettings,
        recognitionRef,
        shouldAutoListenRef,
        lastTTSEndTimeRef
      );
    }
  }, [clearRequestTimeout, lastTTSEndTimeRef, recognitionRef, settings, setStatus, shouldAutoListenRef, showNotification]);

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
