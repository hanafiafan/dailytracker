// In-app notification sound. Drop the file at web/public/sounds/notifikasi.mp3; until it exists a short beep is played instead.
const KEY = "th-sound";
export const soundOn = () => { try { return localStorage.getItem(KEY) !== "off"; } catch { return true; } };
export const setSoundOn = (on: boolean) => { try { localStorage.setItem(KEY, on ? "on" : "off"); } catch { /* private mode */ } };

function beep() {
  try {
    const ctx = new AudioContext(), o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "sine"; o.frequency.value = 880; g.gain.setValueAtTime(0.15, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    o.connect(g).connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.4);
    o.onended = () => void ctx.close();
  } catch { /* no audio available */ }
}
/** Plays the sound (browsers only allow it after the person has touched the page once; otherwise it is skipped silently). */
export function playNotif(force = false) {
  if (!force && !soundOn()) return;
  const a = new Audio("/sounds/notifikasi.mp3");
  a.onerror = beep;
  a.play().catch(() => { if (a.error) beep(); });
}
