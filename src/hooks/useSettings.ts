import { useCallback, useEffect, useState } from 'react';
import { Settings } from '../types';

const defaultSettings: Settings = {
  backendUrl: process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000/analyze',
  useDeviceCamera: true,
  speak: true,
  voiceRate: 1,
  voiceVolume: 1,
  language: 'vi',
  ttsProvider: 'browser',
  zaloSpeakerId: 1,
  zaloSpeed: 1,
  zaloEncodeType: 1,
};

const STORAGE_KEY = 'voiceControl_settings_v2';

const safeParse = <T,>(raw: string | null): T | null => {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

const mergeWithDefaults = (partial: Partial<Settings>): Settings => {
  const merged: Settings = { ...defaultSettings, ...partial };
  merged.voiceRate = Number.isFinite(merged.voiceRate) ? merged.voiceRate : 1;
  merged.voiceVolume = Number.isFinite(merged.voiceVolume) ? merged.voiceVolume : 1;
  merged.zaloSpeed = Number.isFinite(merged.zaloSpeed) ? merged.zaloSpeed : 1;
  merged.zaloSpeed = Math.min(1.2, Math.max(0.8, merged.zaloSpeed));

  if (merged.ttsProvider !== 'browser' && merged.ttsProvider !== 'zalo') merged.ttsProvider = 'browser';
  if (merged.language !== 'vi' && merged.language !== 'en') merged.language = 'vi';
  if (![1, 2, 3, 4, 5, 6].includes(merged.zaloSpeakerId)) merged.zaloSpeakerId = 1;
  if (![0, 1, 2].includes(merged.zaloEncodeType)) merged.zaloEncodeType = 1;
  if (merged.language === 'en') merged.ttsProvider = 'browser';
  return merged;
};

export const useSettings = () => {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const cached = safeParse<Partial<Settings>>(localStorage.getItem(STORAGE_KEY));
    setSettings(cached ? mergeWithDefaults(cached) : defaultSettings);
    setLoaded(true);
  }, []);

  const saveSettings = useCallback(async (): Promise<void> => {
    const merged = mergeWithDefaults(settings);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    setSettings(merged);
  }, [settings]);

  const reloadFromLocal = useCallback(async (): Promise<void> => {
    const cached = safeParse<Partial<Settings>>(localStorage.getItem(STORAGE_KEY));
    setSettings(cached ? mergeWithDefaults(cached) : defaultSettings);
  }, []);

  const resetSettings = useCallback(() => {
    setSettings(defaultSettings);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultSettings));
  }, []);

  const patchSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((previous) => mergeWithDefaults({ ...previous, ...patch }));
  }, []);

  return {
    settings,
    setSettings,
    patchSettings,
    saveSettings,
    resetSettings,
    loaded,
    reloadFromLocal,
  };
};
