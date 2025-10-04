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
      
      // Luôn đính kèm ảnh: ON chụp từ thiết bị, OFF lấy từ Supabase
      if (settings.useDeviceCamera) {
        blob = await captureFromDeviceCamera();
        showNotification('Đã chụp ảnh từ thiết bị');
        setStatus('Chụp ảnh từ thiết bị thành công');
      } else {
        // Lấy ảnh từ Supabase nhưng không thông báo/không nói
        blob = await fetchImageFromSupabaseStorage();
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
              // Sau khi TTS kết thúc, restart speech recognition để đợi "bạn ơi" tiếp theo
              setTimeout(() => {
                if (restartListening) {
                  restartListening();
                } else {
                  shouldAutoListenRef.current = true;
                  if (recognitionRef.current) {
                    try { 
                      recognitionRef.current.start(); 
                      console.log('Speech recognition restarted after TTS completion');
                    } catch (err) {
                      console.log('Failed to restart speech recognition after TTS:', err);
                    }
                  }
                }
              }, 1000);
            },
            recognitionRef,
            shouldAutoListenRef,
            lastTTSEndTimeRef
          );
        } else {
          setStatus('Hoàn tất! Hãy nói "bạn ơi!" để tiếp tục...');
          // Bật lại auto listen và tiếp tục nghe nếu không đọc
          setTimeout(() => {
            if (restartListening) {
              restartListening();
            } else {
              shouldAutoListenRef.current = true;
              if (recognitionRef.current) {
                try { 
                  recognitionRef.current.start(); 
                  console.log('Speech recognition restarted after processing (no TTS)');
                } catch (err) {
                  console.log('Failed to restart speech recognition:', err);
                }
              }
            }
          }, 1200);
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
      
      // Chỉ restart speech recognition nếu không có TTS (vì TTS sẽ tự restart)
      if (!settings.speak) {
        setStatus('Hoàn tất! Hãy nói "bạn ơi!" để tiếp tục...');
        setTimeout(() => {
          if (restartListening) {
            restartListening();
          } else {
            shouldAutoListenRef.current = true;
            if (recognitionRef.current) {
              try { 
                recognitionRef.current.start(); 
                console.log('Speech recognition restarted after error handling');
              } catch (err) {
                console.log('Failed to restart speech recognition:', err);
              }
            }
          }
        }, 2000);
      }
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
          
          // Set timeout để tự động reset nếu không có request trong 5 giây
          timeoutRef.current = setTimeout(() => {
            console.log('Timeout waiting for request, resetting to trigger mode');
            setWaitingForTrigger(true);
            setWaitingForRequest(false);
            setStatus('Hãy nói "bạn ơi!" để bắt đầu...');
            showNotification('Hết thời gian chờ, hãy nói "bạn ơi!" lại');
            timeoutRef.current = null;
          }, 5000);
        }
      );
    } else {
      // Nếu không đọc thì ngay lập tức sẵn sàng nghe
      setWaitingForRequest(true);
      setStatus('Hãy nói yêu cầu của bạn...');
      
      // Set timeout để tự động reset nếu không có request trong 8 giây
      timeoutRef.current = setTimeout(() => {
        console.log('Timeout waiting for request, resetting to trigger mode');
        setWaitingForTrigger(true);
        setWaitingForRequest(false);
        setStatus('Hãy nói "bạn ơi!" để bắt đầu...');
        showNotification('Hết thời gian chờ, hãy nói "bạn ơi!" lại');
        timeoutRef.current = null;
      }, 8000);
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
