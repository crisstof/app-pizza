// Two-note "ding-dong" for new orders, synthesized with Web Audio (no sound
// file). Browsers only allow audio after a user gesture, so `unlockChime()`
// must be called from a click (the "Son" toggle) before `playChime()` works.
let context: AudioContext | null = null;

export async function unlockChime() {
  context ??= new AudioContext();
  if (context.state === "suspended") await context.resume();
}

export function playChime() {
  if (!context || context.state !== "running") return;
  const start = context.currentTime;
  [
    { freq: 880, at: 0 },
    { freq: 660, at: 0.18 },
  ].forEach(({ freq, at }) => {
    const osc = context!.createOscillator();
    const gain = context!.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, start + at);
    gain.gain.exponentialRampToValueAtTime(0.35, start + at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + at + 0.5);
    osc.connect(gain).connect(context!.destination);
    osc.start(start + at);
    osc.stop(start + at + 0.55);
  });
}
