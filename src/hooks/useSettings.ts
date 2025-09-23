import { useState, useEffect, useCallback } from 'react';
import { Settings } from '../types';
import { getAppSettingsFromDb, saveAppSettingsToDb } from '../lib/supabase';

const defaultSettings: Settings = {
  backendUrl: 'http://localhost:5000/analyze',
  useDeviceCamera: true, // true: chụp từ thiết bị; false: lấy từ Supabase
  speak: true,
  voiceRate: 1,
  voiceVolume: 1
};

export const useSettings = () => {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [loaded, setLoaded] = useState(false);
  const mergeWithDefaults = useCallback((partial: Partial<Settings>): Settings => {
    return {
      ...defaultSettings,
      ...partial,
    };
  }, []);

  // Load settings from Supabase (fallback localStorage -> default)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const dbSettings = await getAppSettingsFromDb();
        if (!cancelled && dbSettings) {
          setSettings(mergeWithDefaults(dbSettings as Partial<Settings>));
          setLoaded(true);
          return;
        }
      } catch {}
      // Fallback localStorage (giữ tương thích cũ)
      try {
        const savedSettings = localStorage.getItem('voiceControl_settings');
        if (!cancelled && savedSettings) {
          setSettings(JSON.parse(savedSettings));
        }
      } catch {}
      if (!cancelled) setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, []);

  const saveSettings = useCallback(async (): Promise<void> => {
    // Lưu cả DB và localStorage để có offline fallback
    localStorage.setItem('voiceControl_settings', JSON.stringify(settings));
    const ok = await saveAppSettingsToDb(settings);
    if (!ok) throw new Error('Supabase upsert failed');
  }, [settings]);

  const reloadFromDb = useCallback(async () => {
    const dbSettings = await getAppSettingsFromDb();
    if (dbSettings) {
      setSettings(mergeWithDefaults(dbSettings as Partial<Settings>));
    }
  }, [mergeWithDefaults]);

  const resetSettings = () => {
    setSettings(defaultSettings);
    localStorage.setItem('voiceControl_settings', JSON.stringify(defaultSettings));
    // Không chờ
    saveAppSettingsToDb(defaultSettings).catch(() => {});
  };

  return {
    settings,
    setSettings,
    saveSettings,
    resetSettings,
    loaded,
    reloadFromDb
  };
};
