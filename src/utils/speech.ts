
// Normalize Vietnamese text
export const normalizeVN = (str: string): string => {
  return (str || '').toLowerCase()
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ').trim();
};

// Check if text contains trigger word
export const containsTriggerWord = (text: string): boolean => {
  const normalized = normalizeVN(text);
  const hasTrigger = normalized.includes('ban oi') || normalized.includes('ban ơi');
  console.log('containsTriggerWord check:', { text, normalized, hasTrigger });
  return hasTrigger;
};

// Check if TTS is currently speaking
export const isSpeaking = (): boolean => {
  return speechSynthesis.speaking || speechSynthesis.pending;
};

// Text to speech
export const speakText = async (
  text: string, 
  settings: { voiceRate: number; voiceVolume: number },
  recognitionRef?: React.RefObject<SpeechRecognition | null>,
  shouldAutoListenRef?: React.MutableRefObject<boolean>,
  onEnd?: () => void
): Promise<void> => {
  if (!('speechSynthesis' in window)) return;
  
  console.log('=== SPEAK TEXT DEBUG ===');
  console.log('Speaking text:', text);
  console.log('Stopping speech recognition...');
  
  // Tạm dừng speech recognition để tránh feedback
  if (recognitionRef?.current) {
    try { 
      recognitionRef.current.stop(); 
      console.log('Speech recognition stopped for TTS');
    } catch {}
  }
  
  // Tắt auto listen trong lúc đọc
  if (shouldAutoListenRef) {
    shouldAutoListenRef.current = false;
    console.log('Auto listen disabled for TTS');
  }
  
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'vi-VN';
  utterance.rate = settings.voiceRate;
  utterance.volume = settings.voiceVolume;
  
  utterance.onstart = () => {
    console.log('Speech synthesis started');
  };
    
  utterance.onend = () => {
    console.log('Speech synthesis ended');
    
    // Call onEnd callback nếu có
    onEnd?.();
  };
  
  speechSynthesis.speak(utterance);
  console.log('=== END SPEAK TEXT DEBUG ===');
};

// Speak result with callbacks
export const speakResult = async (
  text: string,
  settings: { voiceRate: number; voiceVolume: number },
  onStart?: () => void,
  onEnd?: () => void,
  recognitionRef?: React.RefObject<SpeechRecognition | null>,
  shouldAutoListenRef?: React.MutableRefObject<boolean>,
  lastTTSEndTimeRef?: React.MutableRefObject<number>
): Promise<void> => {
  if (!('speechSynthesis' in window)) {
    throw new Error('Trình duyệt không hỗ trợ đọc văn bản');
  }

  console.log('=== SPEAK RESULT DEBUG ===');
  console.log('Speaking result:', text);
  console.log('Stopping speech recognition...');

  // Tạm dừng speech recognition để tránh feedback
  if (recognitionRef?.current) {
    try { 
      recognitionRef.current.stop(); 
      console.log('Speech recognition stopped for TTS result');
    } catch {}
  }

  // Tắt auto listen trong lúc đọc
  if (shouldAutoListenRef) {
    shouldAutoListenRef.current = false;
    console.log('Auto listen disabled for TTS result');
  }

  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'vi-VN';
  utterance.rate = settings.voiceRate;
  utterance.volume = settings.voiceVolume;
  
  utterance.onstart = () => {
    console.log('Speech synthesis started');
    onStart?.();
  };
  
  utterance.onend = () => {
    console.log('Speech synthesis ended');
    
    // Set timestamp khi TTS kết thúc
    if (lastTTSEndTimeRef) {
      lastTTSEndTimeRef.current = Date.now();
      console.log('TTS end timestamp set:', lastTTSEndTimeRef.current);
    }
    
    onEnd?.();
  };
  
  speechSynthesis.speak(utterance);
  console.log('=== END SPEAK RESULT DEBUG ===');
};
