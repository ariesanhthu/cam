import { useState, useEffect } from 'react';
import { Settings } from '../types';

const defaultSettings: Settings = {
  backendUrl: 'http://localhost:5000/analyze',
  enableCamera: false,
  useDeviceCamera: true,
  autoSend: true,
  autoListen: false,
  speak: true,
  voiceRate: 1,
  voiceVolume: 1
};

export const useSettings = () => {
  const [settings, setSettings] = useState<Settings>(defaultSettings);

  // Load settings from localStorage
  useEffect(() => {
    const savedSettings = localStorage.getItem('voiceControl_settings');
    if (savedSettings) {
      setSettings(JSON.parse(savedSettings));
    }
  }, []);

  const saveSettings = () => {
    localStorage.setItem('voiceControl_settings', JSON.stringify(settings));
  };

  const resetSettings = () => {
    setSettings(defaultSettings);
    localStorage.setItem('voiceControl_settings', JSON.stringify(defaultSettings));
  };

  return {
    settings,
    setSettings,
    saveSettings,
    resetSettings
  };
};
