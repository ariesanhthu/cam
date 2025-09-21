import { useState, useCallback } from 'react';
import { Notification } from '../types';
import { speakText } from '../utils/speech';

interface UseNotificationProps {
  settings: {
    speak: boolean;
    voiceRate: number;
    voiceVolume: number;
  };
  recognitionRef?: React.RefObject<SpeechRecognition | null>;
}

export const useNotification = ({ settings, recognitionRef }: UseNotificationProps) => {
  const [notification, setNotification] = useState<Notification>({
    message: '',
    type: 'success',
    show: false
  });

  const showNotification = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message, type, show: true });
    setTimeout(() => setNotification(prev => ({ ...prev, show: false })), 3000);
    
    // Speak notification
    if (settings.speak && 'speechSynthesis' in window) {
      speakText(message, { voiceRate: settings.voiceRate, voiceVolume: settings.voiceVolume }, recognitionRef);
    }
  }, [settings.speak, settings.voiceRate, settings.voiceVolume, recognitionRef]); // Include dependencies

  return {
    notification,
    showNotification
  };
};
