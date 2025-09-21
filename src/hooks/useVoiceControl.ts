import { useState, useCallback, useRef } from 'react';
import { Settings } from '../types';
import { captureFromDeviceCamera, fetchImageFromSupabaseStorage } from '../utils/camera';
import { sendToBackend } from '../utils/backend';
import { speakResult, speakText } from '../utils/speech';


interface UseVoiceControlProps {
  settings: Settings;
  showNotification: (message: string, type?: 'success' | 'error') => void;
  setStatus: (status: string) => void;
  setIsListening: (listening: boolean) => void;
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
  lastTTSEndTimeRef
}: UseVoiceControlProps) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [waitingForTrigger, setWaitingForTrigger] = useState(true);
  const [waitingForRequest, setWaitingForRequest] = useState(false);
  const [currentRequest, setCurrentRequest] = useState('');
  
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleUserRequest = useCallback(async (promptText: string) => {
    console.log('handleUserRequest called with:', promptText);
    console.log('Current settings:', settings);
    
    // Cancel timeout nếu có
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    
    setIsProcessing(true);
    setWaitingForRequest(false); // Không còn đợi request nữa
    setStatus('Đang xử lý yêu cầu: ' + promptText);
    showNotification('Đang xử lý yêu cầu...');

    // Tạm dừng listening
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
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
            if (shouldAutoListenRef.current && recognitionRef.current) {
              try { 
                recognitionRef.current.start(); 
                console.log('Speech recognition restarted after processing');
              } catch (err) {
                console.log('Failed to restart speech recognition:', err);
              }
            }
          }, 2000); // Tăng delay để tránh conflict
        }
      } else {
        setStatus('Không nhận được kết quả từ server');
        showNotification('Không nhận được kết quả từ server', 'error');
      }
    } catch (err: unknown) {
      console.error('Error in handleUserRequest:', err);
      showNotification('Lỗi xử lý: ' + (err instanceof Error ? err.message : 'Unknown error'), 'error');
      setStatus('Lỗi xử lý: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setIsProcessing(false);
      // Reset về trạng thái chờ trigger word
      setWaitingForTrigger(true);
      setWaitingForRequest(false);
      setCurrentRequest('');
      setStatus('Hoàn tất! Hãy nói "bạn ơi!" để tiếp tục...');
      
      // Tiếp tục listening sau khi xử lý xong với delay
      setTimeout(() => {
        if (shouldAutoListenRef.current && recognitionRef.current) {
          try { 
            recognitionRef.current.start(); 
            console.log('Speech recognition restarted after error handling');
          } catch (err) {
            console.log('Failed to restart speech recognition:', err);
          }
        }
      }, 2500); // Tăng delay để tránh conflict
    }
  }, [settings, showNotification, setStatus]); // Chỉ include stable dependencies

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
          
          // Set timeout để tự động reset nếu không có request trong 3 giây
          timeoutRef.current = setTimeout(() => {
            console.log('Timeout waiting for request, resetting to trigger mode');
            setWaitingForTrigger(true);
            setWaitingForRequest(false);
            setStatus('Hãy nói "bạn ơi!" để bắt đầu...');
            showNotification('Hết thời gian chờ, hãy nói "bạn ơi!" lại');
            timeoutRef.current = null;
          }, 3000); // 3 giây timeout
        }
      );
    } else {
      // Nếu không đọc thì ngay lập tức sẵn sàng nghe
      setWaitingForRequest(true);
      setStatus('Hãy nói yêu cầu của bạn...');
      
      // Set timeout để tự động reset nếu không có request trong 3 giây
      timeoutRef.current = setTimeout(() => {
        console.log('Timeout waiting for request, resetting to trigger mode');
        setWaitingForTrigger(true);
        setWaitingForRequest(false);
        setStatus('Hãy nói "bạn ơi!" để bắt đầu...');
        showNotification('Hết thời gian chờ, hãy nói "bạn ơi!" lại');
        timeoutRef.current = null;
      }, 3000); // 3 giây timeout
    }
    
    console.log('=== END HANDLE TRIGGER WORD DEBUG ===');
  }, [setStatus, showNotification, settings, waitingForTrigger, waitingForRequest]); // Include state dependencies

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
