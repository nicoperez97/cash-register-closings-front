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
  '.closing-form-shell, .mat-mdc-dialog-container, [data-guy-no-smooth-height], .guy-kpi';

type CardState = {
  lastHeight: number;
  animating: boolean;
  pending: boolean;
  frame: number;
  debounce: number;
  endTimer: number;
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
      };
      states.set(el, s);
    }
    return s;
  };

  const animate = (el: HTMLElement): void => {
    const s = ensureState(el);
    if (s.animating) {
      s.pending = true;
      return;
    }

    const from = s.lastHeight || Math.round(el.getBoundingClientRect().height);
    const to = measureAuto(el);
    if (Math.abs(to - from) < 2) {
      s.lastHeight = to;
      return;
    }

    s.animating = true;
    s.pending = false;
    el.style.overflow = 'hidden';
    el.style.height = `${from}px`;
    void el.offsetHeight;
    el.style.transition = 'height 280ms cubic-bezier(0.22, 1, 0.36, 1)';
    el.style.height = `${to}px`;

    const finish = () => {
      // Marcar lastHeight ANTES de limpiar, sin re-medir (evita otro salto).
      s.lastHeight = to;
      clearInline(el);
      s.animating = false;
      if (s.pending) {
        s.pending = false;
        // Re-medir solo si hubo más cambios durante la animación.
        const next = measureAuto(el);
        if (Math.abs(next - s.lastHeight) >= 2) {
          s.lastHeight = Math.round(el.getBoundingClientRect().height) || s.lastHeight;
          queue(el);
        } else {
          s.lastHeight = next;
        }
      }
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
    if (s.debounce) window.clearTimeout(s.debounce);
    if (s.frame) cancelAnimationFrame(s.frame);
    // Agrupa mutaciones en ráfaga (varios @if / signals) en una sola animación.
    s.debounce = window.setTimeout(() => {
      s.debounce = 0;
      s.frame = requestAnimationFrame(() => {
        s.frame = 0;
        animate(el);
      });
    }, 120);
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
    // Sin `style`: al setear height inline re-entraba y animaba 2–3 veces.
    attributeFilter: ['class', 'hidden', 'aria-busy'],
  });

  return () => {
    mo.disconnect();
  };
}
