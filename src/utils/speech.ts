// src/utils/speech.ts
/* eslint-disable no-console */

import type React from "react";

// =========================
// Normalize Vietnamese text
// =========================
export const normalizeVN = (str: string): string => {
  return (str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

// =========================
// Trigger word detection
// =========================
export const containsTriggerWord = (text: string): boolean => {
  const normalized = normalizeVN(text);

  // Các biến thể phổ biến của "bạn ơi" khi nhận diện giọng nói
  const triggers = [
    "ban oi",
    "ba oi",
    "ba noi",
    "bac oi",
    "bang oi",
    "ban noi",
    "hey you", // thêm tiếng Anh nếu cần
    "ban oi ban oi"
  ];

  const hasTrigger = triggers.some(t => normalized.includes(t));

  console.log("containsTriggerWord check:", { text, normalized, hasTrigger });
  return hasTrigger;
};

// =========================
// Check if TTS is currently speaking (browser TTS only)
// =========================
export const isSpeaking = (): boolean => {
  if (typeof window === "undefined") return false;
  if (typeof speechSynthesis === "undefined") return false;
  return speechSynthesis.speaking || speechSynthesis.pending;
};

// =========================
// SpeechSynthesis voice helpers
// =========================
const waitVoicesReady = (timeoutMs = 600) =>
  new Promise<void>((resolve) => {
    if (typeof window === "undefined" || typeof speechSynthesis === "undefined") {
      resolve();
      return;
    }

    // voices có sẵn -> resolve ngay
    if (speechSynthesis.getVoices().length > 0) {
      resolve();
      return;
    }

    let done = false;
    const t = setTimeout(() => {
      if (done) return;
      done = true;
      resolve();
    }, timeoutMs);

    const handler = () => {
      if (done) return;
      done = true;
      clearTimeout(t);
      try {
        speechSynthesis.removeEventListener("voiceschanged", handler);
      } catch { }
      resolve();
    };

    try {
      speechSynthesis.addEventListener("voiceschanged", handler);
      // kick để browser load voices
      speechSynthesis.getVoices();
    } catch {
      clearTimeout(t);
      resolve();
    }
  });

// =========================
// Audio Context / Unlock Helper (Mobile Safari/Chrome)
// =========================
export const unlockAudio = () => {
  if (typeof window === "undefined") return;

  // Create silent buffer
  const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContext) return;

  const ctx = new AudioContext();
  const buffer = ctx.createBuffer(1, 1, 22050);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);

  // Play silence
  if (source.start) source.start(0);
  else (source as any).noteOn(0);

  // Resume context if suspended (common in newer browsers)
  if (ctx.state === 'suspended') {
    ctx.resume();
  }

  // Clean up
  setTimeout(() => {
    if (ctx.state !== 'closed') ctx.close();
  }, 1000);
};

const hasVoiceForLang = (lang: string) => {
  if (typeof window === "undefined" || typeof speechSynthesis === "undefined") return false;
  const voices = speechSynthesis.getVoices();
  const base = lang.split("-")[0];
  return voices.some((v) => v.lang === lang) || voices.some((v) => v.lang.startsWith(base));
};

/**
 * AUTO fallback:
 * - chỉ fallback Zalo khi đang đọc vi-VN nhưng browser KHÔNG có voice vi
 * - quan trọng: nếu voices rỗng -> coi như không có -> dùng Zalo ngay (đỡ chờ)
 */
const shouldUseZaloFallback = async (ttsLanguage?: "vi-VN" | "en-US") => {
  if (ttsLanguage !== "vi-VN") return false;

  if (typeof window === "undefined" || typeof speechSynthesis === "undefined") return true;

  try {
    const voices = speechSynthesis.getVoices();
    if (!voices || voices.length === 0) return true;
  } catch {
    return true;
  }

  return !hasVoiceForLang("vi-VN");
};

// =========================
// Types
// =========================
type TTSProvider = "browser" | "zalo";

export type SpeakSettings = {
  voiceRate: number;
  voiceVolume: number;

  // optional: provider/language
  ttsProvider?: TTSProvider;
  language: "vi" | "en"; // Ngôn ngữ cho cả API và TTS (bắt buộc)

  // zalo options (optional)
  zaloSpeakerId?: number;
  zaloSpeed?: number;
  zaloEncodeType?: number;
};

// =========================
// Recognition helpers
// =========================
const stopRecognition = (recognitionRef?: React.RefObject<SpeechRecognition | null>) => {
  if (recognitionRef?.current) {
    try {
      recognitionRef.current.stop();
      console.log("Speech recognition stopped for TTS");
    } catch { }
  }
};

const restartRecognitionWithDelay = (
  recognitionRef?: React.RefObject<SpeechRecognition | null>,
  shouldAutoListenRef?: React.MutableRefObject<boolean>,
  delayMs: number = 3000
) => {
  if (!recognitionRef?.current || !shouldAutoListenRef) return;

  setTimeout(() => {
    console.log("Restarting speech recognition after TTS...");
    shouldAutoListenRef.current = true;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.start();
        console.log("Speech recognition restarted after TTS");
      } catch (err) {
        console.log("Failed to restart speech recognition:", err);
      }
    }
  }, delayMs);
};

// =========================
// GLOBAL TTS CONTROL (fix chồng nhiều lần)
// =========================

// Singleton Zalo audio instance đang phát
let currentZaloAudio: HTMLAudioElement | null = null;

// TTS queue/mutex: đảm bảo speak chạy tuần tự
let ttsQueue: Promise<unknown> = Promise.resolve();

const enqueueTTS = <T,>(fn: () => Promise<T>): Promise<T> => {
  const run = async () => fn();
  const next = ttsQueue.then(run, run);
  // giữ queue luôn resolve để không bị "kẹt"
  ttsQueue = next.then(
    () => undefined,
    () => undefined
  );
  return next;
};

/**
 * Stop ALL TTS:
 * - cancel browser speechSynthesis
 * - stop current Zalo audio (nếu có)
 */
export const stopAllTTS = () => {
  // Stop browser TTS
  try {
    if (typeof window !== "undefined" && typeof speechSynthesis !== "undefined") {
      speechSynthesis.cancel();
    }
  } catch { }

  // Stop Zalo audio
  if (currentZaloAudio) {
    try {
      currentZaloAudio.onended = null;
      currentZaloAudio.onerror = null;
      currentZaloAudio.pause();
      currentZaloAudio.currentTime = 0;
    } catch { }
    currentZaloAudio = null;
  }
};

// =========================
// ZALO TTS PLAYER
// =========================
export async function speakWithZaloTTS(
  text: string,
  settings: {
    voiceVolume: number;
    zaloSpeakerId: number;
    zaloSpeed: number;
    zaloEncodeType: number;
  }
) {
  // ✅ chặn chồng audio
  stopAllTTS();

  const res = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      speaker_id: settings.zaloSpeakerId,
      speed: settings.zaloSpeed,
      encode_type: settings.zaloEncodeType,
    }),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Zalo TTS failed: ${res.status} ${t}`);
  }

  const { url } = (await res.json()) as { url: string };
  if (!url) throw new Error("Missing audio url");

  const proxied = `/api/tts/audio?url=${encodeURIComponent(url)}`;
  const audio = new Audio(proxied);

  audio.volume = Math.max(0, Math.min(1, settings.voiceVolume ?? 1));
  currentZaloAudio = audio;

  await new Promise<void>((resolve, reject) => {
    audio.onended = () => {
      if (currentZaloAudio === audio) currentZaloAudio = null;
      resolve();
    };
    audio.onerror = () => {
      console.error("Audio error event:", audio.error, { src: audio.src });
      if (currentZaloAudio === audio) currentZaloAudio = null;
      reject(new Error("Audio play error"));
    };
    audio.play().catch((e) => {
      if (currentZaloAudio === audio) currentZaloAudio = null;
      reject(e);
    });
  });
}

// =========================
// Text to speech (AUTO provider: browser unless no Vietnamese voice -> Zalo)
// =========================
export const speakText = async (
  text: string,
  settings: SpeakSettings,
  recognitionRef?: React.RefObject<SpeechRecognition | null>,
  shouldAutoListenRef?: React.MutableRefObject<boolean>,
  lastTTSEndTimeRef?: React.MutableRefObject<number>,
  onEnd?: () => void
): Promise<void> => {
  return enqueueTTS(async () => {
    console.log("=== SPEAK TEXT DEBUG ===");
    console.log("Speaking text:", text);

    // Stop recognition + disable auto listen to avoid feedback
    stopRecognition(recognitionRef);
    if (shouldAutoListenRef) {
      shouldAutoListenRef.current = false;
      console.log("Auto listen disabled for TTS");
    }

    const markEnd = () => {
      if (lastTTSEndTimeRef) {
        lastTTSEndTimeRef.current = Date.now();
        console.log("TTS end timestamp set:", lastTTSEndTimeRef.current);
      }
    };

    try {
      // ✅ chặn đọc chồng (browser + zalo)
      stopAllTTS();

      // Map language (vi/en) thành ttsLanguage (vi-VN/en-US)
      const lang: "vi-VN" | "en-US" = settings.language === "en" ? "en-US" : "vi-VN";

      // ✅ AUTO fallback: chỉ dùng Zalo khi browser không có voice tiếng Việt (và đang dùng tiếng Việt)
      const useZalo = lang === "vi-VN" && (await shouldUseZaloFallback(lang));

      if (useZalo) {
        console.log("Using Zalo TTS fallback (browser has no Vietnamese voice)");

        await speakWithZaloTTS(text, {
          voiceVolume: settings.voiceVolume,
          zaloSpeakerId: settings.zaloSpeakerId ?? 1,
          zaloSpeed: settings.zaloSpeed ?? 1.0,
          zaloEncodeType: settings.zaloEncodeType ?? 1,
        });

        console.log("Zalo TTS ended (speakText)");
        markEnd();
        onEnd?.();
        return;
      }

      // Browser SpeechSynthesis
      if (typeof window === "undefined" || typeof speechSynthesis === "undefined") {
        console.log("speechSynthesis not supported");
        return;
      }

      // đợi voices (nhẹ) để pick voice chuẩn hơn
      await waitVoicesReady(600);

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang;
      utterance.rate = settings.voiceRate;
      utterance.volume = settings.voiceVolume;

      const voices = speechSynthesis.getVoices();
      const picked =
        voices.find((v) => v.lang === utterance.lang) ||
        voices.find((v) => v.lang.startsWith(utterance.lang.split("-")[0]));
      if (picked) utterance.voice = picked;

      // Guard: nếu đang muốn đọc vi-VN mà không pick được voice vi thì out
      if (utterance.lang === "vi-VN" && !picked) {
        console.log("No Vietnamese voice in browser -> skip browser TTS (prevent odd behavior)");
        return;
      }

      // Wrap browser speech in a promise to wait for it
      await new Promise<void>((resolve, reject) => {
        utterance.onstart = () => {
          console.log("Speech synthesis started");
        };

        utterance.onend = () => {
          console.log("Speech synthesis ended");
          markEnd();
          onEnd?.();
          resolve();
        };

        utterance.onerror = (e) => {
          console.log("Speech synthesis error:", e);
          markEnd();
          onEnd?.();
          // Dont reject main promise to avoid error logging, just finish
          resolve();
        };

        speechSynthesis.speak(utterance);
      });
      console.log("=== END SPEAK TEXT DEBUG ===");

    } catch (err) {
      console.error("speakText error:", err);
      markEnd();
      onEnd?.();
    } finally {
      // ✅ GUARANTEED RESTART
      restartRecognitionWithDelay(recognitionRef, shouldAutoListenRef, 300);
    }
  });
};

// =========================
// Speak result with callbacks (AUTO fallback: browser unless no Vietnamese voice -> Zalo)
// =========================
export const speakResult = async (
  text: string,
  settings: SpeakSettings,
  onStart?: () => void,
  onEnd?: () => void,
  recognitionRef?: React.RefObject<SpeechRecognition | null>,
  shouldAutoListenRef?: React.MutableRefObject<boolean>,
  lastTTSEndTimeRef?: React.MutableRefObject<number>
): Promise<void> => {
  return enqueueTTS(async () => {
    console.log("=== SPEAK RESULT DEBUG ===");
    console.log("Speaking result:", text);

    // Stop recognition + disable auto listen to avoid feedback
    stopRecognition(recognitionRef);
    if (shouldAutoListenRef) {
      shouldAutoListenRef.current = false;
      console.log("Auto listen disabled for TTS result");
    }

    const markEnd = () => {
      if (lastTTSEndTimeRef) {
        lastTTSEndTimeRef.current = Date.now();
        console.log("TTS end timestamp set:", lastTTSEndTimeRef.current);
      }
    };

    try {
      onStart?.();

      // ✅ chặn đọc chồng (browser + zalo)
      stopAllTTS();

      // Map language (vi/en) thành ttsLanguage (vi-VN/en-US)
      const lang: "vi-VN" | "en-US" = settings.language === "en" ? "en-US" : "vi-VN";

      // ✅ AUTO fallback: chỉ dùng Zalo khi browser không có voice tiếng Việt (và đang dùng tiếng Việt)
      const useZalo = lang === "vi-VN" && (await shouldUseZaloFallback(lang));

      if (useZalo) {
        console.log("Using Zalo TTS fallback for result (browser has no Vietnamese voice)");

        await speakWithZaloTTS(text, {
          voiceVolume: settings.voiceVolume,
          zaloSpeakerId: settings.zaloSpeakerId ?? 1,
          zaloSpeed: settings.zaloSpeed ?? 1.0,
          zaloEncodeType: settings.zaloEncodeType ?? 1,
        });

        console.log("Zalo TTS ended (speakResult)");
        markEnd();
        onEnd?.();
        return;
      }

      // Browser SpeechSynthesis
      if (typeof window === "undefined" || typeof speechSynthesis === "undefined") {
        throw new Error("Trình duyệt không hỗ trợ đọc văn bản");
      }

      await waitVoicesReady(600);

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang;
      utterance.rate = settings.voiceRate;
      utterance.volume = settings.voiceVolume;

      const voices = speechSynthesis.getVoices();
      const picked =
        voices.find((v) => v.lang === utterance.lang) ||
        voices.find((v) => v.lang.startsWith(utterance.lang.split("-")[0]));
      if (picked) utterance.voice = picked;

      if (utterance.lang === "vi-VN" && !picked) {
        console.log("No Vietnamese voice in browser -> skip browser TTS (prevent odd behavior)");
        return;
      }

      // Wrap browser speech
      await new Promise<void>((resolve) => {
        utterance.onend = () => {
          console.log("Speech synthesis ended");
          markEnd();
          onEnd?.();
          resolve();
        };

        utterance.onerror = (e) => {
          console.log("Speech synthesis error:", e);
          markEnd();
          onEnd?.();
          resolve();
        };

        speechSynthesis.speak(utterance);
      });
      console.log("=== END SPEAK RESULT DEBUG ===");

    } catch (err) {
      console.error("speakResult error:", err);
      markEnd();
      onEnd?.();
    } finally {
      // ✅ GUARANTEED RESTART
      restartRecognitionWithDelay(recognitionRef, shouldAutoListenRef, 300);
    }
  });
};
