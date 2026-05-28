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
import { fetchImageFromSupabaseStorage } from '../utils/camera';
import { listFilesInBucket } from '../lib/supabase';

export default function VoiceControlApp() {
  const [isListening, setIsListening] = useState(false);
  const [status, setStatus] = useState('Bấm nút để bắt đầu');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const shouldAutoListenRef = useRef(false);
  const lastTTSEndTimeRef = useRef(0);

  const { settings, setSettings, saveSettings, resetSettings, reloadFromDb, loaded } =
    useSettings();
  const { notification, showNotification } = useNotification({ settings, recognitionRef });

  const {
    isProcessing,
    waitingForTrigger,
    waitingForRequest,
    currentRequest,
    setCurrentRequest,
    handleUserRequest,
    handleTriggerWord,
  } = useVoiceControl({
    settings,
    showNotification,
    setStatus,
    recognitionRef,
    shouldAutoListenRef,
    lastTTSEndTimeRef,
  });

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
    recognitionRef,
    shouldAutoListenRef,
  });

  useEffect(() => {
    setTimeout(() => {
      showNotification('Chào mừng! Bấm nút để bắt đầu nghe giọng nói');
    }, 500);
  }, [showNotification]);

  const loadImage = useCallback(async () => {
    if (imageUrl) {
      URL.revokeObjectURL(imageUrl);
      setImageUrl(null);
    }

    setImageLoading(true);
    setImageError(null);

    try {
      console.log('[DEBUG] ===== START SUPABASE DEBUG =====');
      console.log('[DEBUG] Đang lấy ảnh từ Supabase...');
      console.log('[DEBUG] Bucket: cam, Path: cam01/image.jpg');

      console.log('[DEBUG] Đang list files trong bucket "cam"...');
      const rootFiles = await listFilesInBucket('cam');

      if (rootFiles.length === 0) {
        setImageError('Bucket "cam" đang trống. Vui lòng upload file vào folder "cam01".');
        console.warn('[DEBUG] Bucket "cam" trong');
        return;
      }

      console.log('[DEBUG] Tim thay items trong bucket root:', rootFiles);

      const hasCam01Folder = rootFiles.some((file) => file === 'cam01' || file.includes('cam01'));
      if (!hasCam01Folder) {
        setImageError(`Folder "cam01" không tồn tại. Items sẵn có: ${rootFiles.join(', ')}`);
        console.warn('[DEBUG] Folder "cam01" khong co trong bucket');
        return;
      }

      console.log('[DEBUG] Đang list files trong folder "cam01"...');
      const cam01Files = await listFilesInBucket('cam', 'cam01');

      if (cam01Files.length === 0) {
        setImageError('Folder "cam01" đang trống. Vui lòng upload file "image.jpg".');
        console.warn('[DEBUG] Folder "cam01" trong');
        return;
      }

      console.log('[DEBUG] Tim thay files trong folder "cam01":', cam01Files);

      const hasImageJpg = cam01Files.some((file) => file.includes('image.jpg'));
      if (!hasImageJpg) {
        setImageError(
          `File "image.jpg" không tồn tại trong "cam01". Files sẵn có: ${cam01Files.join(', ')}`
        );
        console.warn('[DEBUG] File "image.jpg" khong co trong folder "cam01"');
        return;
      }

      const blob = await fetchImageFromSupabaseStorage();
      if (blob) {
        const nextImageUrl = URL.createObjectURL(blob);
        setImageUrl(nextImageUrl);
        console.log('[DEBUG] Lấy ảnh thành công, size:', blob.size, 'bytes');
      } else {
        setImageError('Không lấy được ảnh từ Supabase. Có thể do policy hoặc permissions.');
        console.warn('[DEBUG] Blob null khi lay anh tu Supabase');
      }

      console.log('[DEBUG] ===== END SUPABASE DEBUG =====');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Lỗi không xác định';
      setImageError(errorMessage);
      console.error('[DEBUG] Exception khi lay anh:', error);
    } finally {
      setImageLoading(false);
    }
  }, [imageUrl]);

  useEffect(() => {
    return () => {
      if (imageUrl) {
        URL.revokeObjectURL(imageUrl);
      }
    };
  }, [imageUrl]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        event.preventDefault();
        if (isListening) {
          stopListening();
        } else {
          startListening();
        }
      }

      if (event.key === 's' && !settingsOpen) {
        setSettingsOpen(true);
      }

      if (event.key === 'Escape' && settingsOpen) {
        setSettingsOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isListening, settingsOpen, startListening, stopListening]);

  return (
    <div className="min-h-screen bg-white dark:bg-black text-black dark:text-white font-sans">
      {!loaded && (
        <div className="fixed inset-0 flex items-center justify-center bg-white/70 dark:bg-black/70 z-50">
          <div className="px-4 py-2 rounded bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700">
            Đang tải cấu hình...
          </div>
        </div>
      )}

      <div className="flex flex-col items-center justify-center min-h-screen p-5 text-center">
        <VoiceControlButton
          isListening={isListening}
          onClick={() => (isListening ? stopListening() : startListening())}
        />

        <StatusDisplay
          status={status}
          isProcessing={isProcessing}
          currentRequest={currentRequest}
          waitingForTrigger={waitingForTrigger}
        />
      </div>

      <button
        onClick={() => setSettingsOpen(true)}
        className={`fixed top-5 right-5 w-15 h-15 rounded-full border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-black text-black dark:text-white text-2xl cursor-pointer shadow-lg transition-opacity duration-300 ${
          settingsOpen ? 'opacity-0 pointer-events-none' : 'opacity-100 z-50'
        }`}
        aria-label="Mở cài đặt"
      >
        ⚙️
      </button>

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
        imageUrl={imageUrl}
        imageLoading={imageLoading}
        imageError={imageError}
        onRefreshImage={loadImage}
      />

      <NotificationToast notification={notification} />
    </div>
  );
}
