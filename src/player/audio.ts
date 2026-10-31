// src/player/audio.ts
// Synthesises short cheer / buzz sounds using the Web Audio API.
// No audio files needed — zero bytes added to the exported HTML.
// Fails silently if AudioContext is unavailable.

/**
 * Plays a short synthesised sound.
 *
 * - cheer: rising pitch over ~0.5 s (correct answer feedback)
 * - buzz:  low flat tone for ~0.5 s (wrong answer feedback)
 *
 * Any AudioContext construction or playback failure is caught and silently
 * ignored — audio is a nice-to-have that must never crash the player.
 */
export function playSound(sound: "cheer" | "buzz"): void {
  try {
    // Support both the standard and the legacy webkit-prefixed constructor.
    const AudioCtx =
      (typeof AudioContext !== "undefined"
        ? AudioContext
        : // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (window as any).webkitAudioContext) as typeof AudioContext | undefined;

    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();

    oscillator.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;
    const duration = 0.5;

    if (sound === "cheer") {
      // Rising pitch: 440 Hz → 880 Hz over 0.5 s
      oscillator.type = "triangle";
      oscillator.frequency.setValueAtTime(440, now);
      oscillator.frequency.linearRampToValueAtTime(880, now + duration);
      // Fade in quickly then fade out
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.3, now + 0.05);
      gain.gain.linearRampToValueAtTime(0, now + duration);
    } else {
      // Buzz: low flat tone at 150 Hz
      oscillator.type = "sawtooth";
      oscillator.frequency.setValueAtTime(150, now);
      // Short sharp envelope
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.linearRampToValueAtTime(0, now + duration);
    }

    oscillator.start(now);
    oscillator.stop(now + duration);

    // Clean up after the sound finishes.
    oscillator.onended = () => {
      try {
        void ctx.close();
      } catch {
        // Ignore close errors.
      }
    };
  } catch {
    // Silently ignore any error — the player must never crash due to audio.
  }
}
