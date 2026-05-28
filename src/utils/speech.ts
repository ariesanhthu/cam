import type React from "react";

export const TRIGGER_PHRASES = [
  "ban oi",
  "ba oi",
  "ba noi",
  "bac oi",
  "bang oi",
  "ban noi",
  "hey you",
  "ban oi ban oi",
] as const;

export const REQUEST_AFTER_TRIGGER_DELAY_MS = 800;
export const POST_TTS_RECOGNITION_GUARD_MS = 1000;
const TTS_RESTART_DELAY_MS = 300;

let currentZaloAudio: HTMLAudioElement | null = null;
let ttsPlaybackActive = false;

export const normalizeVN = (str: string): string => {
  return (str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const TRIGGER_TOKEN_PATTERNS = TRIGGER_PHRASES.map((trigger) =>
  trigger.split(/\s+/).filter(Boolean)
).sort((a, b) => b.length - a.length);

type NormalizedToken = {
  value: string;
  start: number;
};

const getNormalizedTokens = (text: string): NormalizedToken[] => {
  return Array.from((text || "").matchAll(/[\p{L}\p{N}]+/gu))
    .map((match) => ({
      value: normalizeVN(match[0]),
      start: match.index ?? 0,
    }))
    .filter((token) => token.value);
};

const matchTriggerAt = (tokens: NormalizedToken[], startIndex: number): number => {
  for (const pattern of TRIGGER_TOKEN_PATTERNS) {
    const matched = pattern.every(
      (value, offset) => tokens[startIndex + offset]?.value === value
    );

    if (matched) return pattern.length;
  }

  return 0;
};

export const containsTriggerWord = (text: string): boolean => {
  const normalized = normalizeVN(text);
  const tokens = getNormalizedTokens(text);
  const hasTrigger = tokens.some((_, index) => matchTriggerAt(tokens, index) > 0);

  console.log("containsTriggerWord check:", { text, normalized, hasTrigger });
  return hasTrigger;
};

export const stripLeadingTriggerPhrase = (text: string): string => {
  const rawText = text || "";
  const tokens = getNormalizedTokens(rawText);
  let index = 0;
  let consumedTrigger = false;

  while (index < tokens.length) {
    const triggerLength = matchTriggerAt(tokens, index);
    if (!triggerLength) break;

    consumedTrigger = true;
    index += triggerLength;
  }

  if (!consumedTrigger) return rawText.trim();
  if (index >= tokens.length) return "";

  return rawText.slice(tokens[index].start).replace(/^[\s,.:!?-]+/, "").trim();
};

export const isTriggerOnlyText = (text: string): boolean => {
  return normalizeVN(text).length > 0 && stripLeadingTriggerPhrase(text) === "";
};

export const isSpeaking = (): boolean => {
  if (typeof window === "undefined") return false;
  if (ttsPlaybackActive) return true;

  if (currentZaloAudio && !currentZaloAudio.paused && !currentZaloAudio.ended) {
    return true;
  }

  if (typeof speechSynthesis === "undefined") return false;
  return speechSynthesis.speaking || speechSynthesis.pending;
};

const waitVoicesReady = (timeoutMs = 600) =>
  new Promise<void>((resolve) => {
    if (typeof window === "undefined" || typeof speechSynthesis === "undefined") {
      resolve();
      return;
    }

    if (speechSynthesis.getVoices().length > 0) {
      resolve();
      return;
    }

    let done = false;
    const timeout = setTimeout(() => {
      if (done) return;
      done = true;
      resolve();
    }, timeoutMs);

    const handler = () => {
      if (done) return;
      done = true;
      clearTimeout(timeout);

      try {
        speechSynthesis.removeEventListener("voiceschanged", handler);
      } catch {}

      resolve();
    };

    try {
      speechSynthesis.addEventListener("voiceschanged", handler);
      speechSynthesis.getVoices();
    } catch {
      clearTimeout(timeout);
      resolve();
    }
  });

export const unlockAudio = () => {
  if (typeof window === "undefined") return;

  const AudioContextCtor =
    window.AudioContext ||
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) return;

  const ctx = new AudioContextCtor();
  const buffer = ctx.createBuffer(1, 1, 22050);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);

  source.start(0);

  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }

  setTimeout(() => {
    if (ctx.state !== "closed") {
      ctx.close().catch(() => {});
    }
  }, 1000);
};

const hasVoiceForLang = (lang: string) => {
  if (typeof window === "undefined" || typeof speechSynthesis === "undefined") return false;

  const voices = speechSynthesis.getVoices();
  const base = lang.split("-")[0];

  return (
    voices.some((voice) => voice.lang === lang) ||
    voices.some((voice) => voice.lang.startsWith(base))
  );
};

const shouldUseZaloFallback = async (ttsLanguage?: "vi-VN" | "en-US") => {
  if (ttsLanguage !== "vi-VN") return false;
  if (typeof window === "undefined" || typeof speechSynthesis === "undefined") return true;

  await waitVoicesReady(1000);

  try {
    const voices = speechSynthesis.getVoices();
    if (!voices || voices.length === 0) return true;
  } catch {
    return true;
  }

  return !hasVoiceForLang("vi-VN");
};

type TTSProvider = "browser" | "zalo";

export type SpeakSettings = {
  voiceRate: number;
  voiceVolume: number;
  ttsProvider?: TTSProvider;
  language: "vi" | "en";
  zaloSpeakerId?: number;
  zaloSpeed?: number;
  zaloEncodeType?: number;
};

const stopRecognition = (recognitionRef?: React.RefObject<SpeechRecognition | null>) => {
  if (!recognitionRef?.current) return;

  try {
    recognitionRef.current.abort?.();
  } catch {}

  try {
    recognitionRef.current.stop();
    console.log("Speech recognition stopped for TTS");
  } catch {}
};

const restartRecognitionWithDelay = (
  recognitionRef?: React.RefObject<SpeechRecognition | null>,
  shouldAutoListenRef?: React.MutableRefObject<boolean>,
  delayMs: number = TTS_RESTART_DELAY_MS,
  onRestart?: () => void
) => {
  if (!recognitionRef?.current || !shouldAutoListenRef) {
    onRestart?.();
    return;
  }

  setTimeout(() => {
    console.log("Restarting speech recognition after TTS...");
    shouldAutoListenRef.current = true;

    try {
      recognitionRef.current?.start();
      console.log("Speech recognition restarted after TTS");
    } catch (error) {
      console.log("Failed to restart speech recognition:", error);
    } finally {
      onRestart?.();
    }
  }, delayMs);
};

let ttsQueue: Promise<unknown> = Promise.resolve();

const enqueueTTS = <T,>(fn: () => Promise<T>): Promise<T> => {
  const next = ttsQueue.then(fn, fn);
  ttsQueue = next.then(
    () => undefined,
    () => undefined
  );
  return next;
};

export const stopAllTTS = () => {
  try {
    if (typeof window !== "undefined" && typeof speechSynthesis !== "undefined") {
      speechSynthesis.cancel();
    }
  } catch {}

  if (!currentZaloAudio) return;

  try {
    currentZaloAudio.onended = null;
    currentZaloAudio.onerror = null;
    currentZaloAudio.pause();
    currentZaloAudio.currentTime = 0;
  } catch {}

  currentZaloAudio = null;
};

export async function speakWithZaloTTS(
  text: string,
  settings: {
    voiceVolume: number;
    zaloSpeakerId: number;
    zaloSpeed: number;
    zaloEncodeType: number;
  }
) {
  stopAllTTS();
  console.log("Requesting Zalo TTS audio...");

  const response = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      speaker_id: settings.zaloSpeakerId,
      speed: settings.zaloSpeed,
      encode_type: settings.zaloEncodeType,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Zalo TTS failed: ${response.status} ${detail}`);
  }

  const { url } = (await response.json()) as { url: string };
  if (!url) {
    throw new Error("Missing audio url");
  }

  console.log("Playing Zalo TTS audio:", url);
  const audio = new Audio(`/api/tts/audio?url=${encodeURIComponent(url)}`);
  audio.volume = Math.max(0, Math.min(1, settings.voiceVolume ?? 1));
  currentZaloAudio = audio;

  await new Promise<void>((resolve, reject) => {
    audio.onended = () => {
      console.log("Zalo TTS audio ended");
      if (currentZaloAudio === audio) currentZaloAudio = null;
      resolve();
    };

    audio.onerror = () => {
      console.error("Audio error event:", audio.error, { src: audio.src });
      if (currentZaloAudio === audio) currentZaloAudio = null;
      reject(new Error("Audio play error"));
    };

    audio.play().catch((error) => {
      if (currentZaloAudio === audio) currentZaloAudio = null;
      reject(error);
    });
  });
}

const speakWithBrowserTTS = async (
  text: string,
  settings: SpeakSettings,
  ttsLanguage: "vi-VN" | "en-US"
): Promise<boolean> => {
  if (typeof window === "undefined" || typeof speechSynthesis === "undefined") {
    return false;
  }

  await waitVoicesReady(600);

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = ttsLanguage;
  utterance.rate = settings.voiceRate;
  utterance.volume = settings.voiceVolume;

  const voices = speechSynthesis.getVoices();
  const picked =
    voices.find((voice) => voice.lang === utterance.lang) ||
    voices.find((voice) => voice.lang.startsWith(utterance.lang.split("-")[0]));

  if (picked) {
    utterance.voice = picked;
  }

  if (utterance.lang === "vi-VN" && !picked) {
    console.warn("No Vietnamese voice in browser, browser TTS skipped");
    return false;
  }

  const didSpeak = await new Promise<boolean>((resolve) => {
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      console.warn("Speech synthesis timed out before finishing");

      try {
        speechSynthesis.cancel();
      } catch {}

      resolve(false);
    }, Math.max(4000, text.length * 140));

    const finish = (success: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(success);
    };

    utterance.onstart = () => {
      console.log("Speech synthesis started");
    };

    utterance.onend = () => {
      console.log("Speech synthesis ended");
      finish(true);
    };

    utterance.onerror = (error) => {
      console.log("Speech synthesis error:", error);
      finish(false);
    };

    try {
      speechSynthesis.cancel();
      speechSynthesis.speak(utterance);
    } catch (error) {
      console.log("Speech synthesis speak failed:", error);
      finish(false);
    }
  });

  return didSpeak;
};

const resolveTTSProvider = async (
  _settings: SpeakSettings,
  ttsLanguage: "vi-VN" | "en-US"
): Promise<TTSProvider> => {
  if (ttsLanguage === "en-US") {
    return "browser";
  }

  return (await shouldUseZaloFallback(ttsLanguage)) ? "zalo" : "browser";
};

const speakWithResolvedProvider = async (
  text: string,
  settings: SpeakSettings,
  debugLabel: string
) => {
  const ttsLanguage: "vi-VN" | "en-US" =
    settings.language === "en" ? "en-US" : "vi-VN";
  const provider = await resolveTTSProvider(settings, ttsLanguage);

  console.log(`[${debugLabel}] Using ${provider} TTS`);

  if (provider === "zalo") {
    try {
      await speakWithZaloTTS(text, {
        voiceVolume: settings.voiceVolume,
        zaloSpeakerId: settings.zaloSpeakerId ?? 1,
        zaloSpeed: settings.zaloSpeed ?? 1.0,
        zaloEncodeType: settings.zaloEncodeType ?? 1,
      });
      return;
    } catch (error) {
      console.error(`[${debugLabel}] Zalo TTS failed, trying browser fallback`, error);

      const didSpeakInBrowser = await speakWithBrowserTTS(text, settings, ttsLanguage);
      if (didSpeakInBrowser) return;

      throw error;
    }
  }

  const didSpeakInBrowser = await speakWithBrowserTTS(text, settings, ttsLanguage);
  if (didSpeakInBrowser) {
    return;
  }

  if (ttsLanguage === "vi-VN") {
    console.log(`[${debugLabel}] Browser voice unavailable, falling back to Zalo`);
    await speakWithZaloTTS(text, {
      voiceVolume: settings.voiceVolume,
      zaloSpeakerId: settings.zaloSpeakerId ?? 1,
      zaloSpeed: settings.zaloSpeed ?? 1.0,
      zaloEncodeType: settings.zaloEncodeType ?? 1,
    });
    return;
  }

  throw new Error("speechSynthesis not supported");
};

export const speakText = async (
  text: string,
  settings: SpeakSettings,
  recognitionRef?: React.RefObject<SpeechRecognition | null>,
  shouldAutoListenRef?: React.MutableRefObject<boolean>,
  lastTTSEndTimeRef?: React.MutableRefObject<number>,
  onEnd?: () => void,
  onRestart?: () => void
): Promise<void> => {
  return enqueueTTS(async () => {
    console.log("=== SPEAK TEXT DEBUG ===");
    console.log("Speaking text:", text);

    ttsPlaybackActive = true;
    stopRecognition(recognitionRef);
    if (shouldAutoListenRef) {
      shouldAutoListenRef.current = false;
      console.log("Auto listen disabled for TTS");
    }

    try {
      stopAllTTS();
      await speakWithResolvedProvider(text, settings, "speakText");
      console.log("=== END SPEAK TEXT DEBUG ===");
    } catch (error) {
      console.error("speakText error:", error);
    } finally {
      if (lastTTSEndTimeRef) {
        lastTTSEndTimeRef.current = Date.now();
        console.log("TTS end timestamp set:", lastTTSEndTimeRef.current);
      }

      ttsPlaybackActive = false;
      onEnd?.();
      restartRecognitionWithDelay(
        recognitionRef,
        shouldAutoListenRef,
        TTS_RESTART_DELAY_MS,
        onRestart
      );
    }
  });
};

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

    ttsPlaybackActive = true;
    stopRecognition(recognitionRef);
    if (shouldAutoListenRef) {
      shouldAutoListenRef.current = false;
      console.log("Auto listen disabled for TTS result");
    }

    try {
      onStart?.();
      stopAllTTS();
      await speakWithResolvedProvider(text, settings, "speakResult");
      console.log("=== END SPEAK RESULT DEBUG ===");
    } catch (error) {
      console.error("speakResult error:", error);
    } finally {
      if (lastTTSEndTimeRef) {
        lastTTSEndTimeRef.current = Date.now();
        console.log("TTS end timestamp set:", lastTTSEndTimeRef.current);
      }

      ttsPlaybackActive = false;
      onEnd?.();
      restartRecognitionWithDelay(recognitionRef, shouldAutoListenRef);
    }
  });
};
