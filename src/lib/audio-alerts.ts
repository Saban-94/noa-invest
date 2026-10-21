/**
 * Saban Flow Mobile & Desktop Audio Alert Engine
 * Features:
 * - Dual-Mode Audio (Web Audio API synthesis + dedicated file playback)
 * - Walkie-talkie / tactical dispatch double-chime (880Hz -> 1320Hz)
 * - Repeating multi-tone CEO urgent signature alarm
 * - Autoplay unlocking on first user touch / click for iOS Safari & Android
 * - OneSignal foreground push notification listener & tactile haptic vibration
 */

let sharedAudioCtx: AudioContext | null = null;
let isAudioUnlocked = false;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!sharedAudioCtx) {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) {
      sharedAudioCtx = new AudioContextClass();
    }
  }
  return sharedAudioCtx;
}

/**
 * Unlock AudioContext on iOS/Android first tap/click to comply with mobile autoplay policies.
 */
export function enableAudioOnFirstTouch() {
  if (typeof window === "undefined" || isAudioUnlocked) return;

  const unlock = async () => {
    try {
      const ctx = getAudioContext();
      if (ctx && ctx.state === "suspended") {
        await ctx.resume();
      }
      isAudioUnlocked = true;
    } catch {
      // AudioContext unavailable or blocked
    } finally {
      window.removeEventListener("touchstart", unlock);
      window.removeEventListener("touchend", unlock);
      window.removeEventListener("click", unlock);
    }
  };

  window.addEventListener("touchstart", unlock, { passive: true });
  window.addEventListener("touchend", unlock, { passive: true });
  window.addEventListener("click", unlock, { passive: true });
}

/**
 * Synthesizes a tactical double-tone dispatch chime using pure Web Audio API (880Hz -> 1320Hz)
 */
export function synthesizeDispatchChime(volume = 0.8) {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === "suspended") {
      void ctx.resume();
    }

    const now = ctx.currentTime;
    const tonePairs = [
      { freq: 880, start: 0, duration: 0.18, vol: volume },
      { freq: 1320, start: 0.16, duration: 0.28, vol: volume * 0.9 },
    ];

    tonePairs.forEach(({ freq, start, duration, vol }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now + start);

      gain.gain.setValueAtTime(0.0001, now + start);
      gain.gain.exponentialRampToValueAtTime(vol * 0.35, now + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + start + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + start);
      osc.stop(now + start + duration + 0.05);
    });

    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate([60, 40, 60]);
    }
  } catch (err) {
    console.warn("[AudioAlerts] Web Audio synthesis failed:", err);
  }
}

/**
 * Plays the dispatch chime: tries audio file playback first, falls back immediately to Web Audio synthesis.
 */
export async function playDispatchChime(volume = 0.8): Promise<void> {
  if (typeof window === "undefined") return;

  try {
    if (typeof Audio !== "undefined") {
      const audio = new Audio("/sounds/dispatch-alert.mp3");
      audio.volume = Math.max(0, Math.min(1, volume));
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        await playPromise.catch(() => {
          synthesizeDispatchChime(volume);
        });
      }
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate([80, 50, 80]);
      }
      return;
    }
  } catch {
    // Fall back to Web Audio API synthesizer
  }
  synthesizeDispatchChime(volume);
}

/**
 * Mobile repeating alarm for urgent CEO signature / manager review requests.
 * Fires three ascending alert pulses (880Hz -> 1320Hz -> 1760Hz) with prominent vibration.
 */
export function playUrgentSignatureAlarm() {
  if (typeof window === "undefined") return;

  try {
    const ctx = getAudioContext();
    if (ctx) {
      if (ctx.state === "suspended") {
        void ctx.resume();
      }

      const now = ctx.currentTime;
      // 3 repeating pulse waves
      const pulses = [
        { f1: 880, f2: 1320, offset: 0 },
        { f1: 1100, f2: 1540, offset: 0.28 },
        { f1: 1320, f2: 1760, offset: 0.56 },
      ];

      pulses.forEach(({ f1, f2, offset }) => {
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();

        osc1.type = "sine";
        osc2.type = "triangle";
        osc1.frequency.setValueAtTime(f1, now + offset);
        osc2.frequency.setValueAtTime(f2, now + offset);

        gain.gain.setValueAtTime(0.0001, now + offset);
        gain.gain.exponentialRampToValueAtTime(0.35, now + offset + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.22);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);

        osc1.start(now + offset);
        osc2.start(now + offset);
        osc1.stop(now + offset + 0.24);
        osc2.stop(now + offset + 0.24);
      });
    }

    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate([100, 50, 200, 50, 100]);
    }
  } catch (err) {
    console.warn("[AudioAlerts] Urgent alarm synthesis failed:", err);
  }
}

/**
 * Registers OneSignal Push Notification event listener when present on window.
 */
export function setupOneSignalPushListener() {
  if (typeof window === "undefined") return;

  const win = window as unknown as {
    OneSignal?: {
      Notifications?: {
        addEventListener: (event: string, cb: (e: unknown) => void) => void;
      };
    };
  };

  if (win.OneSignal?.Notifications) {
    try {
      win.OneSignal.Notifications.addEventListener("foregroundWillDisplay", (event) => {
        console.log("[OneSignal] Foreground push received:", event);
        void playDispatchChime(0.9);
        if (typeof navigator !== "undefined" && navigator.vibrate) {
          navigator.vibrate([100, 50, 200]);
        }
      });
    } catch (e) {
      console.warn("[OneSignal] Listener setup warning:", e);
    }
  }
}
