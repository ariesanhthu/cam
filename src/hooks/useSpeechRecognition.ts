import { useRef, useCallback } from 'react';
import { normalizeVN, containsTriggerWord, isSpeaking } from '../utils/speech';


interface UseSpeechRecognitionProps {
  isProcessing: boolean;
  waitingForTrigger: boolean;
  waitingForRequest: boolean;
  onTriggerWord: () => void;
  onUserRequest: (text: string) => void;
  onStatusChange: (status: string) => void;
  setIsListening?: (listening: boolean) => void;
}

export const useSpeechRecognition = ({
  isProcessing,
  waitingForTrigger,
  waitingForRequest,
  onTriggerWord,
  onUserRequest,
  onStatusChange,
  setIsListening
}: UseSpeechRecognitionProps) => {
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const shouldAutoListenRef = useRef(false);
  const lastCaptureTimeRef = useRef(0);
  const waitingForTriggerRef = useRef(waitingForTrigger);
  const waitingForRequestRef = useRef(waitingForRequest);
  const lastTTSEndTimeRef = useRef(0); // Track khi TTS kết thúc
  
  // Sync ref với state
  waitingForTriggerRef.current = waitingForTrigger;
  waitingForRequestRef.current = waitingForRequest;

  const setupRecognition = useCallback(() => {
    const SpeechRecognition = (window as SpeechRecognitionWindow).SpeechRecognition || (window as SpeechRecognitionWindow).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      onStatusChange('Trình duyệt không hỗ trợ nhận diện giọng nói');
      return false;
    }

    recognitionRef.current = new SpeechRecognition();
    recognitionRef.current.lang = 'vi-VN';
    recognitionRef.current.continuous = true;
    recognitionRef.current.interimResults = true;

    recognitionRef.current.onstart = () => {
      console.log('Speech recognition started');
      setIsListening?.(true);
      onStatusChange('Đang nghe...');
    };

    recognitionRef.current.onend = () => {
      console.log('Speech recognition ended');
      setIsListening?.(false);
      onStatusChange('Đã dừng nghe');
      
      // Chỉ restart nếu không đang xử lý, TTS không chạy và đã được enable
      if (shouldAutoListenRef.current && recognitionRef.current && !isProcessing && !isSpeaking()) {
        console.log('Auto-restarting recognition...');
        setTimeout(() => {
          if (shouldAutoListenRef.current && recognitionRef.current && !isProcessing && !isSpeaking()) {
            try { 
              recognitionRef.current.start(); 
              console.log('Speech recognition auto-restarted successfully');
            } catch (err) {
              console.log('Failed to auto-restart speech recognition:', err);
            }
          }
        }, 1500); // Tăng delay để tránh restart quá nhanh và tránh ghi nhận âm thanh hệ thống
      }
    };

    recognitionRef.current.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.log('Speech recognition error:', event.error);
      if (event.error === 'no-speech') {
        onStatusChange('Không nghe thấy giọng nói');
      } else if (event.error === 'not-allowed') {
        onStatusChange('Vui lòng cho phép sử dụng microphone');
      } else {
        onStatusChange('Lỗi: ' + event.error);
      }
    };

    recognitionRef.current.onresult = (event: SpeechRecognitionEvent) => {
      console.log('=== ONRESULT DEBUG ===');
      console.log('Event:', event);
      console.log('Result index:', event.resultIndex);
      console.log('Results length:', event.results.length);
      
      let finalTranscript = '';
      let interimTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        const isFinal = event.results[i].isFinal;
        console.log(`Result ${i}: "${transcript}" (final: ${isFinal})`);
        
        if (isFinal) {
          finalTranscript += transcript + ' ';
        } else {
          interimTranscript += transcript;
        }
      }

      console.log('Final transcript:', finalTranscript);
      console.log('Interim transcript:', interimTranscript);

      const text = finalTranscript || interimTranscript;
      if (text) {
        console.log('Processing text:', text);
        const normalizedText = normalizeVN(text.trim());
        console.log('Normalized text:', normalizedText);
        
        // Nếu đang xử lý hoặc TTS đang chạy thì không làm gì cả
        if (isProcessing || isSpeaking()) {
          console.log('Currently processing or TTS speaking, ignoring result');
          return;
        }

        // Kiểm tra từ khóa "bạn ơi" để kích hoạt
        if (waitingForTriggerRef.current) {
          console.log('Waiting for trigger word, waitingForTrigger:', waitingForTriggerRef.current);
          if (containsTriggerWord(text)) {
            console.log('Trigger word detected!');
            onTriggerWord();
            return;
          }
          onStatusChange('Nghe được: ' + text.trim() + ' (chờ "bạn ơi!")');
          return;
        }

        // Nếu đã kích hoạt và đang đợi request và có final transcript đủ dài thì xử lý
        if (!waitingForTriggerRef.current && waitingForRequestRef.current && finalTranscript.trim() && finalTranscript.trim().split(' ').length >= 2) {
          console.log('=== PROCESSING USER REQUEST ===');
          console.log('waitingForTrigger:', waitingForTrigger);
          console.log('finalTranscript:', finalTranscript.trim());
          console.log('Word count:', finalTranscript.trim().split(' ').length);
          console.log('Processing user request:', finalTranscript.trim());
          const now = Date.now();
          
          // Kiểm tra xem có phải vừa kết thúc TTS không
          if (now - lastTTSEndTimeRef.current < 4000) {
            console.log('Too soon after TTS ended, ignoring to prevent feedback');
            onStatusChange('Đang đợi sau khi đọc xong...');
            return;
          }
          
          // Kiểm tra không phải trigger word trong request
          if (containsTriggerWord(finalTranscript.trim())) {
            console.log('Trigger word detected in request, ignoring');
            onStatusChange('Vui lòng nói yêu cầu, không cần nói "bạn ơi!" nữa');
            return;
          }
          
          if (now - lastCaptureTimeRef.current > 2000) {
            lastCaptureTimeRef.current = now;
            onUserRequest(finalTranscript.trim());
          } else {
            console.log('Too soon since last request, ignoring');
          }
          console.log('=== END PROCESSING USER REQUEST ===');
        } else if (!waitingForTriggerRef.current && waitingForRequestRef.current) {
          console.log('Not enough words or not final:', finalTranscript.trim());
          console.log('waitingForTrigger:', waitingForTriggerRef.current);
          console.log('waitingForRequest:', waitingForRequestRef.current);
          console.log('finalTranscript length:', finalTranscript.trim().split(' ').length);
          onStatusChange('Nghe được: ' + text.trim());
        } else if (!waitingForTriggerRef.current && !waitingForRequestRef.current) {
          console.log('Not waiting for request, ignoring speech');
          onStatusChange('Đang xử lý, không nghe thêm...');
        }
      } else {
        console.log('No text in result');
      }
      console.log('=== END ONRESULT DEBUG ===');
    };

    return true;
  }, [onStatusChange, setIsListening, onTriggerWord, onUserRequest]); // Chỉ include stable dependencies

  const startListening = useCallback(async () => {
    console.log('=== START LISTENING DEBUG ===');
    console.log('recognitionRef.current:', recognitionRef.current);
    console.log('shouldAutoListenRef.current:', shouldAutoListenRef.current);
    console.log('isProcessing:', isProcessing);
    console.log('waitingForTrigger:', waitingForTrigger);
    
    if (!recognitionRef.current) {
      console.log('Setting up recognition...');
      const success = setupRecognition();
      if (!success) return;
    }
    try {
      console.log('Requesting microphone access...');
      await navigator.mediaDevices.getUserMedia({ audio: true });
      shouldAutoListenRef.current = true;
      console.log('Starting recognition...');
      if (recognitionRef.current) {
        recognitionRef.current.start();
      }
      console.log('Recognition started successfully');
    } catch (err) {
      console.error('Error starting listening:', err);
      throw new Error('Vui lòng cho phép sử dụng microphone');
    }
    console.log('=== END START LISTENING DEBUG ===');
  }, [setupRecognition]); // Chỉ include setupRecognition

  const stopListening = useCallback(() => {
    shouldAutoListenRef.current = false;
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
    }
  }, []);

  const restartListening = useCallback(() => {
    console.log('Restarting listening manually...');
    shouldAutoListenRef.current = true;
    if (recognitionRef.current && !isProcessing && !isSpeaking()) {
      setTimeout(() => {
        if (shouldAutoListenRef.current && recognitionRef.current && !isProcessing && !isSpeaking()) {
          try { 
            recognitionRef.current.start(); 
            console.log('Speech recognition manually restarted');
          } catch (err) {
            console.log('Failed to manually restart speech recognition:', err);
          }
        }
      }, 1000);
    }
  }, [isProcessing]);

  return {
    recognitionRef,
    shouldAutoListenRef,
    setupRecognition,
    startListening,
    stopListening,
    restartListening
  };
};
