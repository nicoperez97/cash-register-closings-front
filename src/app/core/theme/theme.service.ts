import { Injectable, computed, effect, signal } from '@angular/core';

export type ThemeMode = 'light' | 'dark' | 'system';

export interface ColorPreset {
  id: string;
  label: string;
  primary: string;
  accent: string;
}

export const COLOR_PRESETS: ColorPreset[] = [
  { id: 'default', label: 'Predeterminado', primary: '#1B2A33', accent: '#2E7D32' },
  { id: 'classic', label: 'Clásico', primary: '#003366', accent: '#2e7d32' },
  { id: 'ocean', label: 'Océano', primary: '#0B5CAB', accent: '#00A3A1' },
  { id: 'violet', label: 'Violeta', primary: '#4A3F8C', accent: '#E05A8C' },
];

const STORAGE_KEY = 'guy_template_theme';

type ThemeState = {
  mode: ThemeMode;
  presetId: string;
  primary: string;
  accent: string;
};

const DEFAULT: ThemeState = {
  mode: 'light',
  presetId: 'default',
  primary: '#1B2A33',
  accent: '#2E7D32',
};

/** Ocultar selector de tema en UI; la app corre siempre en claro. */
export const THEME_SWITCHER_ENABLED = false;

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly state = signal<ThemeState>(this.read());
  private media?: MediaQueryList;
  /** Login y pantallas auth: siempre light, sin cambiar la preferencia del usuario. */
  private readonly forceLight = signal(true);
  /** Color principal del local activo (sobrescribe el accent del tema). */
  private readonly shopAccent = signal<string | null>(null);
  /** Color de énfasis / secundario del local activo. */
  private readonly shopAccentSecondary = signal<string | null>(null);

  /** Flag de UI: el botón de tema está oculto por ahora. */
  readonly themeSwitcherEnabled = THEME_SWITCHER_ENABLED;

  readonly mode = computed(() => (THEME_SWITCHER_ENABLED ? this.state().mode : 'light'));
  readonly presetId = computed(() => this.state().presetId);
  readonly primary = computed(() => this.state().primary);
  readonly accent = computed(() => this.shopAccent() ?? this.state().accent);
  readonly accentSecondary = computed(
    () => this.shopAccentSecondary() ?? this.shopAccent() ?? this.state().accent,
  );
  readonly presets = COLOR_PRESETS;

  readonly resolvedMode = computed<'light' | 'dark'>(() => {
    if (!THEME_SWITCHER_ENABLED || this.forceLight()) return 'light';
    const mode = this.state().mode;
    if (mode === 'system') {
      return this.systemPrefersDark() ? 'dark' : 'light';
    }
    return mode;
  });

  readonly isDark = computed(() => this.resolvedMode() === 'dark');

  constructor() {
    if (typeof window !== 'undefined') {
      this.media = window.matchMedia('(prefers-color-scheme: dark)');
      this.media.addEventListener('change', () => {
        if (THEME_SWITCHER_ENABLED && this.state().mode === 'system' && !this.forceLight()) {
          this.apply();
        }
      });
    }

    if (!THEME_SWITCHER_ENABLED) {
      this.state.update((s) => ({ ...s, mode: 'light' }));
      this.forceLight.set(true);
    }

    effect(() => {
      this.state();
      this.forceLight();
      this.shopAccent();
      this.shopAccentSecondary();
      this.apply();
      this.persist();
    });
  }

  /** Fuerza light en DOM (p. ej. login). No modifica ni persiste la preferencia. */
  lockLight(locked: boolean): void {
    this.forceLight.set(locked);
  }

  /** Acento del local activo. No se persiste en localStorage del tema. */
  setShopAccent(color: string | null): void {
    const next = color?.trim() || null;
    if (this.shopAccent() === next) return;
    this.shopAccent.set(next);
  }

  /** Segundo color (énfasis) del local activo. */
  setShopAccentSecondary(color: string | null): void {
    const next = color?.trim() || null;
    if (this.shopAccentSecondary() === next) return;
    this.shopAccentSecondary.set(next);
  }

  setMode(mode: ThemeMode): void {
    this.state.update((s) => ({ ...s, mode }));
  }

  cycleMode(): void {
    const order: ThemeMode[] = ['light', 'dark', 'system'];
    const i = order.indexOf(this.state().mode);
    this.setMode(order[(i + 1) % order.length]);
  }

  applyPreset(presetId: string): void {
    const preset = COLOR_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    this.state.update((s) => ({
      ...s,
      presetId: preset.id,
      primary: preset.primary,
      accent: preset.accent,
    }));
  }

  setPrimary(primary: string): void {
    this.state.update((s) => ({ ...s, primary, presetId: 'custom' }));
  }

  setAccent(accent: string): void {
    this.state.update((s) => ({ ...s, accent, presetId: 'custom' }));
  }

  modeIcon(): string {
    const mode = this.state().mode;
    if (mode === 'dark') return 'dark_mode';
    if (mode === 'light') return 'light_mode';
    return 'brightness_auto';
  }

  modeLabel(): string {
    const mode = this.state().mode;
    if (mode === 'dark') return 'Oscuro';
    if (mode === 'light') return 'Claro';
    return 'Sistema';
  }

  private systemPrefersDark(): boolean {
    return !!this.media?.matches;
  }

  private apply(): void {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    const { primary } = this.state();
    const accent = this.shopAccent() ?? this.state().accent;
    /** Énfasis explícito del local; si no hay, se reutiliza el principal. */
    const accentSecondaryExplicit = this.shopAccentSecondary();
    const accentSecondary = accentSecondaryExplicit ?? accent;
    /**
     * El “negro/navy” de la UI (títulos, focos, botones outlined, etc.)
     * pasa a ser el color de énfasis del local cuando está definido.
     */
    const brandPrimary = accentSecondaryExplicit ?? primary;
    const dark = this.resolvedMode() === 'dark';

    root.dataset['theme'] = dark ? 'dark' : 'light';
    root.style.colorScheme = dark ? 'dark' : 'light';
    root.style.setProperty('--guy-primary', brandPrimary);
    root.style.setProperty('--guy-accent', accent);
    root.style.setProperty('--guy-accent-secondary', accentSecondary);
    root.style.setProperty('--guy-navy', brandPrimary);
    root.style.setProperty('--guy-blue', brandPrimary);
    root.style.setProperty('--guy-green', accent);
    root.style.setProperty('--guy-orange', accentSecondary);

    document.body.style.colorScheme = dark ? 'dark' : 'light';
  }

  private persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state()));
    } catch {
      /* ignore */
    }
  }

  private read(): ThemeState {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...DEFAULT };
      const parsed = JSON.parse(raw) as Partial<ThemeState>;
      return {
        mode: parsed.mode ?? DEFAULT.mode,
        presetId: parsed.presetId ?? DEFAULT.presetId,
        primary: parsed.primary ?? DEFAULT.primary,
        accent: parsed.accent ?? DEFAULT.accent,
      };
    } catch {
      return { ...DEFAULT };
    }
  }
}
