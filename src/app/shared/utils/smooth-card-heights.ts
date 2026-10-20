/** Selectores de cards cuyo alto debe animarse al cambiar el contenido. */
const CARD_SELECTOR = [
  '.panel-card',
  '.guy-entity-card',
  '.guy-empty',
  '.pay-card',
  '.stock-card',
  '.shortage-card',
  '.co-card',
  '.mon-card',
  '.home-module-tile',
  '[guySmoothHeight]',
].join(',');

const SKIP_SELECTOR =
  // .guy-filters: ya anima Mostrar/Ocultar con CSS; el smooth-height peleaba y estiraba 2 veces.
  // app-data-table: las tarjetas de la lista cambian todas juntas (compacta/detallada,
  // expandir); la tabla maneja su alto y animar cada una se veía como un doble estirón.
  '.closing-form-shell, .mat-mdc-dialog-container, [data-guy-no-smooth-height], .guy-kpi, .guy-filters, app-data-table';

/** Tras montar / navegar: solo sincronizar altura, sin animar (evita “desplegar 2 veces”). */
const ENTER_GRACE_MS = 800;

type CardState = {
  lastHeight: number;
  animating: boolean;
  pending: boolean;
  frame: number;
  debounce: number;
  endTimer: number;
  bornAt: number;
  /** Ya hizo al menos una animación real (no sync de gracia). */
  hasAnimated: boolean;
  /** Alto viejo fijado inline mientras se espera el debounce. */
  locked: boolean;
};

/**
 * Anima height cuando el contenido de una card crece/encoge.
 * La card se acopla al contenido; el cambio no es brusco.
 */
export function installSmoothCardHeights(root: ParentNode = document): () => void {
  if (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return () => undefined;
  }

  const states = new WeakMap<HTMLElement, CardState>();

  const closestCard = (node: Node | null): HTMLElement | null => {
    if (!node) return null;
    const el =
      node.nodeType === Node.ELEMENT_NODE
        ? (node as Element)
        : node.parentElement;
    if (!el) return null;
    const card = el.closest(CARD_SELECTOR) as HTMLElement | null;
    if (!card) return null;
    if (card.closest(SKIP_SELECTOR)) return null;
    // Listas: el alto lo define la tabla; animarlo al entrar = “desplegar 2 veces”.
    // Esas pantallas usan fade de opacidad en app-data-table.
    if (
      card.matches('.panel-card--flush') ||
      card.querySelector('app-data-table, .guy-table-wrap')
    ) {
      return null;
    }
    // No pelear con loadings / busy: el contenido aún no estabilizó.
    if (card.matches('[aria-busy="true"], .guy-kpi--loading') || card.querySelector('[aria-busy="true"]')) {
      return null;
    }
    return card;
  };

  const measureAuto = (el: HTMLElement): number => {
    const prevH = el.style.height;
    const prevT = el.style.transition;
    const prevO = el.style.overflow;
    el.style.transition = 'none';
    el.style.height = 'auto';
    el.style.overflow = '';
    const h = Math.round(el.getBoundingClientRect().height);
    el.style.height = prevH;
    el.style.transition = prevT;
    el.style.overflow = prevO;
    return h;
  };

  const clearInline = (el: HTMLElement): void => {
    el.style.height = '';
    el.style.transition = '';
    el.style.overflow = '';
  };

  const ensureState = (el: HTMLElement): CardState => {
    let s = states.get(el);
    if (!s) {
      s = {
        lastHeight: measureAuto(el),
        animating: false,
        pending: false,
        frame: 0,
        debounce: 0,
        endTimer: 0,
        bornAt: Date.now(),
        hasAnimated: false,
        locked: false,
      };
      states.set(el, s);
    }
    return s;
  };

  const syncHeight = (el: HTMLElement, s: CardState): void => {
    s.lastHeight = measureAuto(el);
    s.pending = false;
    if (s.locked && !s.animating) clearInline(el);
    s.locked = false;
    if (s.animating) {
      clearInline(el);
      s.animating = false;
      if (s.endTimer) {
        window.clearTimeout(s.endTimer);
        s.endTimer = 0;
      }
    }
  };

  const animate = (el: HTMLElement): void => {
    const s = ensureState(el);

    // Entrada a la pantalla / primer pintado de datos: sin animación de altura.
    if (Date.now() - s.bornAt < ENTER_GRACE_MS) {
      syncHeight(el, s);
      return;
    }

    if (s.animating) {
      s.pending = true;
      return;
    }

    const from = s.lastHeight || Math.round(el.getBoundingClientRect().height);
    const to = measureAuto(el);
    if (Math.abs(to - from) < 2) {
      s.lastHeight = to;
      if (s.locked) clearInline(el);
      s.locked = false;
      return;
    }

    // Primer llenado grande (barra de carga → tabla): snap, no “desplegar”.
    if (!s.hasAnimated && from < 120 && to > from + 80) {
      syncHeight(el, s);
      return;
    }

    s.animating = true;
    s.locked = false;
    s.pending = false;
    s.hasAnimated = true;
    el.style.overflow = 'hidden';
    el.style.height = `${from}px`;
    void el.offsetHeight;
    el.style.transition = 'height 280ms cubic-bezier(0.22, 1, 0.36, 1)';
    el.style.height = `${to}px`;

    const finish = () => {
      s.lastHeight = to;
      clearInline(el);
      s.animating = false;
      if (!s.pending) return;
      s.pending = false;
      requestAnimationFrame(() => {
        const next = measureAuto(el);
        s.lastHeight = next;
        // Solo re-encadenar cambios grandes (paginator/totales menores se ignoran).
        if (Math.abs(next - to) >= 24) queue(el);
      });
    };

    const onEnd = (ev: TransitionEvent) => {
      if (ev.target !== el || ev.propertyName !== 'height') return;
      el.removeEventListener('transitionend', onEnd);
      if (s.endTimer) window.clearTimeout(s.endTimer);
      s.endTimer = 0;
      finish();
    };
    el.addEventListener('transitionend', onEnd);
    s.endTimer = window.setTimeout(() => {
      el.removeEventListener('transitionend', onEnd);
      s.endTimer = 0;
      finish();
    }, 400);
  };

  const queue = (el: HTMLElement): void => {
    const s = ensureState(el);
    // El MutationObserver corre antes del pintado: fijar ya el alto viejo. Si no, el
    // contenido nuevo se pintaba con su alto final y 120 ms después la animación
    // volvía al alto viejo para recién crecer/achicarse ("se estira dos veces").
    if (
      !s.animating &&
      !s.locked &&
      s.lastHeight > 0 &&
      Date.now() - s.bornAt >= ENTER_GRACE_MS
    ) {
      el.style.overflow = 'hidden';
      el.style.height = `${s.lastHeight}px`;
      s.locked = true;
    }
    if (s.debounce) window.clearTimeout(s.debounce);
    if (s.frame) cancelAnimationFrame(s.frame);
    // Agrupa mutaciones en ráfaga (varios @if / signals) en una sola animación.
    s.debounce = window.setTimeout(() => {
      s.debounce = 0;
      s.frame = requestAnimationFrame(() => {
        s.frame = 0;
        animate(el);
      });
    }, 60);
  };

  root.querySelectorAll(CARD_SELECTOR).forEach((node) => {
    const el = node as HTMLElement;
    if (el.closest(SKIP_SELECTOR)) return;
    ensureState(el);
  });

  const mo = new MutationObserver((mutations) => {
    const cards = new Set<HTMLElement>();
    for (const m of mutations) {
      // Ignorar mutaciones de style que provoca esta misma animación (loop).
      if (m.type === 'attributes' && m.attributeName === 'style') continue;
      const card = closestCard(m.target);
      if (card) cards.add(card);
      m.addedNodes.forEach((n) => {
        if (n.nodeType !== Node.ELEMENT_NODE) return;
        const el = n as HTMLElement;
        if (el.matches?.(CARD_SELECTOR) && !el.closest(SKIP_SELECTOR)) {
          ensureState(el);
        }
        el.querySelectorAll?.(CARD_SELECTOR).forEach((c) => {
          const cardEl = c as HTMLElement;
          if (!cardEl.closest(SKIP_SELECTOR)) ensureState(cardEl);
        });
      });
    }
    cards.forEach(queue);
  });

  mo.observe(root === document ? document.body : root, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    // Sin `style` ni `aria-busy`: busy→listo + filas encadenaban 2 animaciones al entrar.
    attributeFilter: ['class', 'hidden'],
  });

  return () => {
    mo.disconnect();
  };
}
