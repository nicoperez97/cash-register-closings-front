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
  peak = 0.16,
): void {
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.018);
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

/** Dos notas cortas, tipo llamado de salón. */
export function playReservationPendingSound(): void {
  const audio = audioContext();
  if (!audio) return;
  void audio.resume().then(() => {
    if (audio.state !== 'running') return;
    const now = audio.currentTime;
    tone(audio, now, 784, 0.14, 0.14);
    tone(audio, now + 0.13, 1046.5, 0.2, 0.18);
  });
}
