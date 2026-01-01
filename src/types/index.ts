
export type TTSProvider = "browser" | "zalo";

export interface Settings {
  ttsProvider: TTSProvider;

  backendUrl: string;
  useDeviceCamera: boolean;
  speak: boolean;
  voiceRate: number;
  voiceVolume: number;
  language: "vi" | "en"; // Ngôn ngữ cho cả backend API và text-to-speech

  // NEW: zalo tts
  zaloSpeakerId: 1 | 2 | 3 | 4 | 5 | 6;
  zaloSpeed: number;       // 0.8..1.2
  zaloEncodeType: 0 | 1 | 2; // wav/mp3/aac
}

export interface Notification {
  message: string;
  type: 'success' | 'error';
  show: boolean;
}

export interface AppState {
  isListening: boolean;
  status: string;
  settingsOpen: boolean;
  notification: Notification;
  isProcessing: boolean;
  pendingUserRequest: string;
  waitingForTrigger: boolean;
  currentRequest: string;
}
