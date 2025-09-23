export interface Settings {
  backendUrl: string;
  useDeviceCamera: boolean;
  speak: boolean;
  voiceRate: number;
  voiceVolume: number;
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
