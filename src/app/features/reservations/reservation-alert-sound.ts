/** Avisos sonoros de reservas (admin: solicitud web; tablero /r: reserva nueva). */

type WebAudioWindow = Window & {
  webkitAudioContext?: typeof AudioContext;
};

let ctx: AudioContext | null = null;
let listenersBound = false;
let unlocked = false;

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
  type: OscillatorType = 'triangle',
): void {
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain);
  gain.connect(audio.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

/** Solicitud web pendiente: dos notas graves tipo llamado de salón. */
function schedulePendingChime(audio: AudioContext): void {
  const t = audio.currentTime;
  tone(audio, t, 523.25, 0.16, 0.3, 'sine');
  tone(audio, t + 0.18, 392.0, 0.28, 0.34, 'sine');
  tone(audio, t + 0.52, 523.25, 0.16, 0.3, 'sine');
  tone(audio, t + 0.7, 392.0, 0.32, 0.36, 'sine');
}

/** Tablero público: campanita aguda (Mi–Sol–Do–Mi). */
function scheduleBoardChime(audio: AudioContext): void {
  const t = audio.currentTime;
  tone(audio, t, 659.25, 0.1, 0.26);
  tone(audio, t + 0.09, 783.99, 0.1, 0.28);
  tone(audio, t + 0.18, 1046.5, 0.12, 0.3);
  tone(audio, t + 0.32, 1318.5, 0.2, 0.32);
}

function playWith(schedule: (audio: AudioContext) => void): void {
  const audio = audioContext();
  if (!audio) return;
  const play = () => {
    if (audio.state !== 'running') return;
    unlocked = true;
    try {
      schedule(audio);
    } catch {
      // ignore
    }
  };
  if (audio.state === 'running') {
    play();
    return;
  }
  void audio.resume().then(play).catch(() => undefined);
}

export function isReservationAlertSoundUnlocked(): boolean {
  return unlocked && !!ctx && ctx.state === 'running';
}

export function unlockReservationAlertSound(): void {
  const audio = audioContext();
  if (!audio) return;
  const mark = () => {
    if (audio.state === 'running') unlocked = true;
  };
  void audio.resume().then(mark).catch(() => undefined);
  try {
    const buffer = audio.createBuffer(1, 1, 22050);
    const src = audio.createBufferSource();
    src.buffer = buffer;
    src.connect(audio.destination);
    src.start(0);
    mark();
  } catch {
    // ignore
  }
}

/**
 * Desbloquea audio con el primer gesto (y los siguientes si el browser lo suspende).
 * Los navegadores no permiten sonido sin interacción; al entrar a /r se intenta igual.
 */
export function bindReservationAlertSoundUnlock(): void {
  if (listenersBound || typeof document === 'undefined') return;
  listenersBound = true;
  const unlock = () => unlockReservationAlertSound();
  document.addEventListener('pointerdown', unlock, { passive: true });
  document.addEventListener('keydown', unlock);
  document.addEventListener('touchstart', unlock, { passive: true });
  document.addEventListener('click', unlock, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') unlockReservationAlertSound();
  });
  unlockReservationAlertSound();
}

/** Admin: llegó una solicitud web pendiente. */
export function playReservationPendingSound(): void {
  playWith(schedulePendingChime);
}

/** Tablero /r: apareció una reserva nueva en la lista. */
export function playReservationBoardSound(): void {
  playWith(scheduleBoardChime);
}
