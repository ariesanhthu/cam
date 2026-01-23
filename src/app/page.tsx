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

  // Function để load image từ Supabase
  const loadImage = useCallback(async () => {
    // Cleanup URL cũ trước khi load mới
    if (imageUrl) {
      URL.revokeObjectURL(imageUrl);
      setImageUrl(null);
    }

    setImageLoading(true);
    setImageError(null);
    try {
      console.log('[DEBUG] ===== BẮT ĐẦU DEBUG SUPABASE =====');
      console.log('[DEBUG] Đang lấy ảnh từ Supabase...');
      console.log('[DEBUG] Bucket: cam, Path: cam01/image.jpg');
      
      // Thử list files trong bucket để debug
      console.log('[DEBUG] Đang list files trong bucket "cam"...');
      const rootFiles = await listFilesInBucket('cam');
      
      if (rootFiles.length === 0) {
        const errorMsg = 'Bucket "cam" đang trống. Vui lòng upload file vào folder "cam01" trước.';
        setImageError(errorMsg);
        console.warn('[DEBUG] ⚠️ Bucket "cam" trống - không có file nào');
        console.warn('[DEBUG] Hướng dẫn: Vào Supabase Dashboard > Storage > cam > Upload file vào folder "cam01/image.jpg"');
        return;
      }
      
      console.log('[DEBUG] ✓ Tìm thấy', rootFiles.length, 'item(s) trong bucket root:', rootFiles);
      
      // Kiểm tra xem có folder cam01 không
      const hasCam01Folder = rootFiles.some(f => f === 'cam01' || f.includes('cam01'));
      if (!hasCam01Folder) {
        const errorMsg = `Folder "cam01" không tồn tại trong bucket. Items có sẵn: ${rootFiles.join(', ')}`;
        setImageError(errorMsg);
        console.warn('[DEBUG] ⚠️ Folder "cam01" không có trong bucket');
        console.warn('[DEBUG] Items có sẵn:', rootFiles);
        return;
      }
      
      // List files trong folder cam01
      console.log('[DEBUG] Đang list files trong folder "cam01"...');
      const cam01Files = await listFilesInBucket('cam', 'cam01');
      
      if (cam01Files.length === 0) {
        const errorMsg = 'Folder "cam01" đang trống. Vui lòng upload file "image.jpg" vào folder này.';
        setImageError(errorMsg);
        console.warn('[DEBUG] ⚠️ Folder "cam01" trống - không có file nào');
        return;
      }
      
      console.log('[DEBUG] ✓ Tìm thấy', cam01Files.length, 'file(s) trong folder "cam01":', cam01Files);
      
      // Kiểm tra xem có file image.jpg không
      const hasImageJpg = cam01Files.some(f => f.includes('image.jpg'));
      if (!hasImageJpg) {
        const errorMsg = `File "image.jpg" không tồn tại trong folder "cam01". Files có sẵn: ${cam01Files.join(', ')}`;
        setImageError(errorMsg);
        console.warn('[DEBUG] ⚠️ File "image.jpg" không có trong folder "cam01"');
        console.warn('[DEBUG] Files có sẵn:', cam01Files);
        return;
      }
      
      const blob = await fetchImageFromSupabaseStorage();
      if (blob) {
        const url = URL.createObjectURL(blob);
        setImageUrl(url);
        console.log('[DEBUG] ✓ Đã lấy ảnh thành công, size:', blob.size, 'bytes');
      } else {
        const errorMsg = 'Không lấy được ảnh từ Supabase. Có thể do thiếu permissions (RLS policy).';
        setImageError(errorMsg);
        console.warn('[DEBUG] ✗ Không lấy được ảnh: blob null');
        console.warn('[DEBUG] File tồn tại nhưng không download được - có thể do RLS policy');
      }
      console.log('[DEBUG] ===== KẾT THÚC DEBUG SUPABASE =====');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Lỗi không xác định';
      setImageError(errorMsg);
      console.error('[DEBUG] ✗ Exception khi lấy ảnh:', error);
    } finally {
      setImageLoading(false);
    }
  }, [imageUrl]);

  // Cleanup image URL khi component unmount
  useEffect(() => {
    return () => {
      if (imageUrl) {
        URL.revokeObjectURL(imageUrl);
      }
    };
  }, [imageUrl]);


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
        imageUrl={imageUrl}
        imageLoading={imageLoading}
        imageError={imageError}
        onRefreshImage={loadImage}
      />

      {/* Notification */}
      <NotificationToast notification={notification} />
    </div>
  );
}
