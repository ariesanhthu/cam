import { useState, useEffect, useCallback } from 'react';
import { Settings } from '../types';
import { getAppSettingsFromDb, saveAppSettingsToDb } from '../lib/supabase';

const defaultSettings: Settings = {
  backendUrl: 'http://localhost:5000/analyze',
  useDeviceCamera: true,
  speak: true,
  voiceRate: 1,
  voiceVolume: 1,
  language: 'vi', // Ngôn ngữ mặc định: tiếng Việt (dùng cho cả API và TTS)

  ttsProvider: 'browser',
  zaloSpeakerId: 1,
  zaloSpeed: 1.0,
  zaloEncodeType: 1,
};

const STORAGE_KEY = 'voiceControl_settings';

// helper: parse JSON an toàn
const safeParse = <T,>(raw: string | null): T | null => {
  if (!raw) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
};

// helper: merge + clamp giá trị cho chắc
const mergeWithDefaults = (partial: Partial<Settings>): Settings => {
  const merged: Settings = { ...defaultSettings, ...partial };

  // clamp vài field hay sai
  merged.voiceRate = Number.isFinite(merged.voiceRate) ? merged.voiceRate : 1;
  merged.voiceVolume = Number.isFinite(merged.voiceVolume) ? merged.voiceVolume : 1;

  // Zalo speed range theo docs 0.8–1.2
  if (!Number.isFinite(merged.zaloSpeed)) merged.zaloSpeed = 1.0;
  merged.zaloSpeed = Math.min(1.2, Math.max(0.8, merged.zaloSpeed));

  // đảm bảo enum hợp lệ
  if (merged.ttsProvider !== 'browser' && merged.ttsProvider !== 'zalo') {
    merged.ttsProvider = 'browser';
  }
  if (merged.language !== 'vi' && merged.language !== 'en') {
    merged.language = 'vi';
  }

  // speaker_id hợp lệ 1..6
  if (![1,2,3,4,5,6].includes(merged.zaloSpeakerId as any)) merged.zaloSpeakerId = 1;
  // encode_type 0/1/2
  if (![0,1,2].includes(merged.zaloEncodeType as any)) merged.zaloEncodeType = 1;

  // Nếu chọn tiếng Anh thì ép provider về browser (Zalo TTS chỉ hỗ trợ tiếng Việt)
  if (merged.language === 'en') {
    merged.ttsProvider = 'browser';
  }

  return merged;
};

export const useSettings = () => {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [loaded, setLoaded] = useState(false);

  // Load: Supabase -> localStorage -> defaults (đều merge defaults)
  useEffect(() => {
    let cancelled = false;

    (async () => {
      // 1) Try DB
      try {
        const dbSettings = await getAppSettingsFromDb();
        if (!cancelled && dbSettings) {
          const merged = mergeWithDefaults(dbSettings as Partial<Settings>);
          setSettings(merged);

          // sync localStorage để offline fallback luôn “mới”
          try { localStorage.setItem(STORAGE_KEY, JSON.stringify(merged)); } catch {}
          setLoaded(true);
          return;
        }
      } catch {}

      // 2) Fallback localStorage
      try {
        const cached = safeParse<Partial<Settings>>(localStorage.getItem(STORAGE_KEY));
        if (!cancelled && cached) {
          setSettings(mergeWithDefaults(cached));
          setLoaded(true);
          return;
        }
      } catch {}

      // 3) Default
      if (!cancelled) {
        setSettings(defaultSettings);
        setLoaded(true);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  // Save: localStorage trước, DB sau
  const saveSettings = useCallback(async (): Promise<void> => {
    const merged = mergeWithDefaults(settings);

    // local first (đỡ mất cấu hình khi DB lỗi)
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(merged)); } catch {}

    const ok = await saveAppSettingsToDb(merged);
    if (!ok) throw new Error('Supabase upsert failed');
  }, [settings]);

  const reloadFromDb = useCallback(async () => {
    const dbSettings = await getAppSettingsFromDb();
    if (dbSettings) {
      const merged = mergeWithDefaults(dbSettings as Partial<Settings>);
      setSettings(merged);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(merged)); } catch {}
    }
  }, []);

  const resetSettings = useCallback(() => {
    setSettings(defaultSettings);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultSettings)); } catch {}
    saveAppSettingsToDb(defaultSettings).catch(() => {});
  }, []);

  // Optional helper: update settings kiểu patch (đỡ phải spread ở UI nhiều)
  const patchSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => mergeWithDefaults({ ...prev, ...patch }));
  }, []);

  return {
    settings,
    setSettings,     // giữ để bạn tương thích code cũ
    patchSettings,   // NEW: khuyến nghị dùng trong UI
    saveSettings,
    resetSettings,
    loaded,
    reloadFromDb
  };
};
