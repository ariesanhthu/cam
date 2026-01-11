'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSettings } from '../hooks/useSettings';
import { useNotification } from '../hooks/useNotification';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import { useVoiceControl } from '../hooks/useVoiceControl';
import { VoiceControlButton } from '../components/VoiceControlButton';
import { StatusDisplay } from '../components/StatusDisplay';
import { SettingsPanel } from '../components/SettingsPanel';
import { NotificationToast } from '../components/NotificationToast';

export default function VoiceControlApp() {
  const [isListening, setIsListening] = useState(false);
  const [status, setStatus] = useState('Bấm nút để bắt đầu');
  const [settingsOpen, setSettingsOpen] = useState(false);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const shouldAutoListenRef = useRef(false);
  const isProcessingRef = useRef(false);
  const waitingForTriggerRef = useRef(true);
  const lastTTSEndTimeRef = useRef(0);

  const { settings, setSettings, saveSettings, resetSettings, reloadFromDb, loaded } = useSettings();
  const { notification, showNotification } = useNotification({ settings, recognitionRef });

  // Create a stable callback for restartListening
  const restartListeningRef = useRef<(() => void) | null>(null);
  const handleRestartListening = useCallback(() => {
    if (restartListeningRef.current) {
      restartListeningRef.current();
    }
  }, []);

  // Initialize voice control hook
  const {
    isProcessing,
    waitingForTrigger,
    waitingForRequest,
    currentRequest,
    setCurrentRequest,
    handleUserRequest,
    handleTriggerWord
  } = useVoiceControl({
    settings,
    showNotification,
    setStatus,
    setIsListening,
    recognitionRef,
    shouldAutoListenRef,
    lastTTSEndTimeRef,
    restartListening: handleRestartListening
  });

  // Initialize speech recognition hook
  const { startListening, stopListening } = useSpeechRecognition({
    isProcessing,
    waitingForTrigger,
    waitingForRequest,
    onTriggerWord: handleTriggerWord,
    onUserRequest: (text: string) => {
      setCurrentRequest(text);
      handleUserRequest(text);
    },
    onStatusChange: setStatus,
    setIsListening,
    lastTTSEndTimeRef
  });

  // Store restartListening in ref
  // restartListeningRef.current = restartListening;

  // Speech recognition được handle bởi useSpeechRecognition hook
  // Không cần setup ở đây nữa

  // Sync refs với state - gộp lại để giảm re-render
  useEffect(() => {
    isProcessingRef.current = isProcessing;
    waitingForTriggerRef.current = waitingForTrigger;

    // Tạm dừng speech recognition khi đang xử lý
    if (isProcessing && recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch { }
    }
  }, [isProcessing, waitingForTrigger]);

  // Initialize - chỉ chạy 1 lần
  useEffect(() => {
    // Welcome message - không tự động start listening
    setTimeout(() => {
      showNotification('Chào mừng! Bấm nút để bắt đầu nghe giọng nói');
    }, 500);
  }, []); // Empty dependency array - chỉ chạy 1 lần

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        if (isListening) {
          stopListening();
        } else {
          startListening();
        }
      }
      if (e.key === 's' && !settingsOpen) {
        setSettingsOpen(true);
      }
      if (e.key === 'Escape' && settingsOpen) {
        setSettingsOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isListening, settingsOpen, startListening, stopListening]); // Include dependencies

  return (
    <div className="min-h-screen bg-white dark:bg-black text-black dark:text-white font-sans">
      {!loaded && (
        <div className="fixed inset-0 flex items-center justify-center bg-white/70 dark:bg-black/70 z-50">
          <div className="px-4 py-2 rounded bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700">Đang tải cấu hình...</div>
        </div>
      )}
      {/* Main Voice Control Screen */}
      <div className="flex flex-col items-center justify-center min-h-screen p-5 text-center">
        <VoiceControlButton
          isListening={isListening}
          onClick={() => isListening ? stopListening() : startListening()}
        />

        <StatusDisplay
          status={status}
          isProcessing={isProcessing}
          currentRequest={currentRequest}
          waitingForTrigger={waitingForTrigger}
        />
      </div>

      {/* Settings Button */}
      <button
        onClick={() => setSettingsOpen(true)}
        className={`fixed top-5 right-5 w-15 h-15 rounded-full border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-black text-black dark:text-white text-2xl cursor-pointer shadow-lg transition-opacity duration-300 ${settingsOpen ? 'opacity-0 pointer-events-none' : 'opacity-100 z-50'
          }`}
        aria-label="Mở cài đặt"
      >
        ⚙️
      </button>

      {/* Settings Panel */}
      <SettingsPanel
        settingsOpen={settingsOpen}
        settings={settings}
        onClose={() => setSettingsOpen(false)}
        onSettingsChange={setSettings}
        onSave={async () => {
          try {
            await saveSettings();
            showNotification('Đã lưu cài đặt thành công!');
            await reloadFromDb();
          } catch {
            showNotification('Đã lưu cài đặt local');
          }
        }}
        onReset={() => {
          resetSettings();
          showNotification('Đã reset về mặc định!');
        }}
      />

      {/* Notification */}
      <NotificationToast notification={notification} />
    </div>
  );
}
