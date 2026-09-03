/** Aviso sonoro al llegar una solicitud web de reserva. */

type WebAudioWindow = Window & {
  webkitAudioContext?: typeof AudioContext;
};

let ctx: AudioContext | null = null;
let listenersBound = false;

function audioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AC = window.AudioContext || (window as WebAudioWindow).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  return ctx;
}

function tone(
  audio: AudioContext,
  start: number,
  frequency: number,
  duration: number,
  peak = 0.28,
): void {
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain);
  gain.connect(audio.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

export function unlockReservationAlertSound(): void {
  const audio = audioContext();
  if (!audio) return;
  void audio.resume();
  try {
    const buffer = audio.createBuffer(1, 1, 22050);
    const src = audio.createBufferSource();
    src.buffer = buffer;
    src.connect(audio.destination);
    src.start(0);
  } catch {
    // ignore
  }
}

export function bindReservationAlertSoundUnlock(): void {
  if (listenersBound || typeof document === 'undefined') return;
  listenersBound = true;
  const once = () => {
    unlockReservationAlertSound();
    document.removeEventListener('pointerdown', once);
    document.removeEventListener('keydown', once);
  };
  document.addEventListener('pointerdown', once);
  document.addEventListener('keydown', once);
}

/** Campanita corta (Mi–Sol–Do–Mi), aviso de solicitud web. */
export function playReservationPendingSound(): void {
  const audio = audioContext();
  if (!audio) return;
  void audio.resume().then(() => {
    if (audio.state !== 'running') return;
    const t = audio.currentTime;
    tone(audio, t, 659.25, 0.1, 0.26);
    tone(audio, t + 0.09, 783.99, 0.1, 0.28);
    tone(audio, t + 0.18, 1046.5, 0.12, 0.3);
    tone(audio, t + 0.32, 1318.5, 0.2, 0.32);
  });
}
