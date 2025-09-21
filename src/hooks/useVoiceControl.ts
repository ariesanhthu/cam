import { useState, useCallback } from 'react';
import { Settings } from '../types';
import { captureFromDeviceCamera, fetchImageFromSupabaseStorage } from '../utils/camera';
import { sendToBackend } from '../utils/backend';
import { speakResult, speakText } from '../utils/speech';

interface UseVoiceControlProps {
  settings: Settings;
  showNotification: (message: string, type?: 'success' | 'error') => void;
  setStatus: (status: string) => void;
  setIsListening: (listening: boolean) => void;
  recognitionRef: any;
  shouldAutoListenRef: any;
  lastTTSEndTimeRef: any;
}

export const useVoiceControl = ({
  settings,
  showNotification,
  setStatus,
  setIsListening,
  recognitionRef,
  shouldAutoListenRef,
  lastTTSEndTimeRef
}: UseVoiceControlProps) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [waitingForTrigger, setWaitingForTrigger] = useState(true);
  const [waitingForRequest, setWaitingForRequest] = useState(false);
  const [currentRequest, setCurrentRequest] = useState('');

  const handleUserRequest = useCallback(async (promptText: string) => {
    console.log('handleUserRequest called with:', promptText);
    console.log('Current settings:', settings);
    
    setIsProcessing(true);
    setWaitingForRequest(false); // Không còn đợi request nữa
    setStatus('Đang xử lý yêu cầu: ' + promptText);
    showNotification('Đang xử lý yêu cầu...');

    // Tạm dừng listening
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (_) {}
    }

    try {
      let blob: Blob | null = null;
      
      // Only capture if camera is enabled
      if (settings.enableCamera) {
        if (settings.useDeviceCamera) {
          // Use device camera
          blob = await captureFromDeviceCamera();
          showNotification('Đã chụp ảnh từ thiết bị');
          setStatus('Chụp ảnh từ thiết bị thành công');
        } else {
          // Fetch from Supabase
          blob = await fetchImageFromSupabaseStorage();
          showNotification('Đã tải ảnh từ Supabase');
          setStatus('Tải ảnh từ Supabase thành công');
        }
      } else {
        setStatus('Gửi yêu cầu không có ảnh');
      }

      // Send to backend
      setStatus('Đang gửi đến server...');
      console.log('Sending to backend:', { blob: blob ? 'has blob' : 'no blob', promptText, backendUrl: settings.backendUrl });
      
      const result = await sendToBackend(blob, promptText, settings);
      console.log('Backend response:', result);
      
      if (result) {
        setStatus('Đã nhận kết quả');
        
        if (settings.speak) {
          await speakResult(
            result,
            { voiceRate: settings.voiceRate, voiceVolume: settings.voiceVolume },
            () => setStatus('Đang đọc kết quả...'),
            () => {
              setStatus('Hoàn tất! Hãy nói "bạn ơi!" để tiếp tục...');
            },
            recognitionRef,
            shouldAutoListenRef,
            lastTTSEndTimeRef
          );
        } else {
          setStatus('Hoàn tất! Hãy nói "bạn ơi!" để tiếp tục...');
          // Tiếp tục listening nếu không đọc với delay
          setTimeout(() => {
            if (shouldAutoListenRef.current) {
              try { recognitionRef.current.start(); } catch (_) {}
            }
          }, 1000);
        }
      } else {
        setStatus('Không nhận được kết quả từ server');
        showNotification('Không nhận được kết quả từ server', 'error');
      }
    } catch (err: any) {
      console.error('Error in handleUserRequest:', err);
      showNotification('Lỗi xử lý: ' + err.message, 'error');
      setStatus('Lỗi xử lý: ' + err.message);
    } finally {
      setIsProcessing(false);
      // Reset về trạng thái chờ trigger word
      setWaitingForTrigger(true);
      setWaitingForRequest(false);
      setCurrentRequest('');
      setStatus('Hoàn tất! Hãy nói "bạn ơi!" để tiếp tục...');
      
      // Tiếp tục listening sau khi xử lý xong với delay
      setTimeout(() => {
        if (shouldAutoListenRef.current) {
          try { recognitionRef.current.start(); } catch (_) {}
        }
      }, 1500);
    }
  }, [settings, showNotification, setStatus, recognitionRef, shouldAutoListenRef]); // Thêm dependencies

  const handleTriggerWord = useCallback(() => {
    console.log('=== HANDLE TRIGGER WORD DEBUG ===');
    console.log('Current waitingForTrigger:', waitingForTrigger);
    console.log('Setting waitingForTrigger to false');
    setWaitingForTrigger(false);
    setStatus('Đã nghe "bạn ơi!", hãy nói yêu cầu...');
    showNotification('Đã nghe "bạn ơi!", hãy nói yêu cầu...');
    
    // Nói phản hồi và đợi nói xong mới bắt đầu nghe yêu cầu
    if (settings.speak) {
      speakText(
        'Bạn cần giúp gì?',
        { voiceRate: settings.voiceRate, voiceVolume: settings.voiceVolume },
        recognitionRef,
        shouldAutoListenRef,
        () => {
          console.log('Trigger word response finished, ready to listen for request');
          setWaitingForRequest(true); // Bắt đầu đợi request
          setStatus('Hãy nói yêu cầu của bạn...');
        }
      );
    } else {
      // Nếu không đọc thì ngay lập tức sẵn sàng nghe
      setWaitingForRequest(true);
      setStatus('Hãy nói yêu cầu của bạn...');
    }
    
    console.log('=== END HANDLE TRIGGER WORD DEBUG ===');
  }, [setStatus, showNotification, settings, recognitionRef, shouldAutoListenRef]); // Thêm dependencies

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
