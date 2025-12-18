import { useState, useCallback } from 'react';
import { Notification } from '../types';

interface UseNotificationProps {
  settings: {
    speak: boolean; // giữ interface để không phá chỗ khác
    voiceRate: number;
    voiceVolume: number;
  };
  recognitionRef?: React.RefObject<SpeechRecognition | null>; // giữ cho tương thích
}

export const useNotification = ({ settings, recognitionRef }: UseNotificationProps) => {
  const [notification, setNotification] = useState<Notification>({
    message: '',
    type: 'success',
    show: false
  });

  const showNotification = useCallback(
    (message: string, type: 'success' | 'error' = 'success') => {
      // ✅ CHỈ HIỂN THỊ UI
      setNotification({ message, type, show: true });

      // auto hide sau 3s
      setTimeout(() => {
        setNotification(prev => ({ ...prev, show: false }));
      }, 3000);

      // ❌ KHÔNG ĐỌC TTS CHO NOTIFICATION
      // (cố ý không gọi speakText để tránh chồng tiếng / bug mobile)
    },
    []
  );

  return {
    notification,
    showNotification
  };
};
