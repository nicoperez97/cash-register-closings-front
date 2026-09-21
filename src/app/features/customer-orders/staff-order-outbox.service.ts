import {
  DestroyRef,
  Injectable,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Subject, firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { OfflineService } from '../../core/offline/offline.service';
import {
  CreatePublicCustomerOrderBody,
  CustomerOrdersApiService,
} from './customer-orders-api.service';
import { apiErrorMessage, isRetryableOrderError } from './ordering-ui.util';

const STORAGE_KEY = 'cierres.staff-order-outbox.v1';

export type StaffOrderOutboxJob = {
  id: string;
  shopId: string;
  clientRequestId: string;
  body: CreatePublicCustomerOrderBody;
  queuedAt: string;
  attempts: number;
  lastError?: string | null;
  failed?: boolean;
};

export function newStaffOrderClientRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `cr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

function readJobs(): StaffOrderOutboxJob[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StaffOrderOutboxJob[];
    return Array.isArray(parsed)
      ? parsed.filter((j) => j && j.shopId && j.body && j.clientRequestId)
      : [];
  } catch {
    return [];
  }
}

@Injectable({ providedIn: 'root' })
export class StaffOrderOutboxService {
  private readonly api = inject(CustomerOrdersApiService);
  private readonly offline = inject(OfflineService);
  private readonly auth = inject(AuthService);
  private readonly snack = inject(MatSnackBar);
  private readonly destroyRef = inject(DestroyRef);
  private flushing = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly synced$ = new Subject<number>();

  readonly jobs = signal<StaffOrderOutboxJob[]>(readJobs());
  readonly pendingCount = computed(() => this.jobs().filter((j) => !j.failed).length);
  readonly synced = this.synced$.asObservable();

  constructor() {
    if (typeof window !== 'undefined') {
      const onStorage = (ev: StorageEvent) => {
        if (ev.key === STORAGE_KEY) this.jobs.set(readJobs());
      };
      window.addEventListener('storage', onStorage);
      this.destroyRef.onDestroy(() => {
        window.removeEventListener('storage', onStorage);
        if (this.retryTimer) clearTimeout(this.retryTimer);
      });
    }
    effect(() => {
      const online = this.offline.effectivelyOnline();
      const authed = !!this.auth.currentUser();
      untracked(() => {
        if (online && authed) void this.flush();
      });
    });
  }

  countFor(shopId: string | null | undefined): number {
    const id = String(shopId ?? '').trim();
    return this.jobs().filter((j) => !j.failed && (!id || j.shopId === id)).length;
  }

  failedCountFor(shopId: string | null | undefined): number {
    const id = String(shopId ?? '').trim();
    return this.jobs().filter((j) => !!j.failed && (!id || j.shopId === id)).length;
  }

  enqueue(shopId: string, body: CreatePublicCustomerOrderBody): void {
    const clientRequestId =
      String(body.clientRequestId ?? '').trim() || newStaffOrderClientRequestId();
    const job: StaffOrderOutboxJob = {
      id: newStaffOrderClientRequestId(),
      shopId,
      clientRequestId,
      body: { ...body, clientRequestId },
      queuedAt: new Date().toISOString(),
      attempts: 0,
    };
    this.jobs.update((list) => [...list, job]);
    this.persist();
    void this.flush();
  }

  retryFailed(): void {
    this.jobs.update((list) =>
      list.map((j) => (j.failed ? { ...j, failed: false, attempts: 0 } : j)),
    );
    this.persist();
    void this.flush();
  }

  async flush(): Promise<void> {
    if (this.flushing || !this.offline.effectivelyOnline()) return;
    if (!this.auth.isAuthenticated()) return;
    const pending = this.jobs().filter((j) => !j.failed);
    if (!pending.length) return;
    this.flushing = true;
    let sent = 0;
    let hadRetryable = false;
    try {
      for (const job of pending) {
        if (!this.offline.effectivelyOnline() || !this.auth.isAuthenticated()) break;
        try {
          await firstValueFrom(
            this.api.createStaffOrder(job.shopId, {
              ...job.body,
              clientRequestId: job.clientRequestId,
            }),
          );
          this.remove(job.id);
          sent += 1;
        } catch (err) {
          const status = Number((err as { status?: number })?.status ?? 0);
          if (status === 401 || status === 403) {
            this.patch(job.id, {
              lastError: apiErrorMessage(err, 'Sesión vencida'),
            });
            break;
          }
          if (isRetryableOrderError(err)) {
            hadRetryable = true;
            this.patch(job.id, {
              attempts: job.attempts + 1,
              lastError: apiErrorMessage(err, 'Sin red'),
            });
          } else {
            this.patch(job.id, {
              failed: true,
              lastError: apiErrorMessage(err, 'No se pudo enviar'),
            });
          }
        }
      }
    } finally {
      this.flushing = false;
    }
    if (sent) {
      this.synced$.next(sent);
      this.snack.open(
        sent === 1
          ? 'Pedido en cola enviado. Cocina ya tiene el ticket.'
          : `Se enviaron ${sent} pedidos pendientes. Cocina ya tiene los tickets.`,
        'OK',
        { duration: 4000 },
      );
    }
    if (hadRetryable && this.offline.effectivelyOnline()) {
      this.scheduleRetry();
    }
  }

  private scheduleRetry(): void {
    if (this.retryTimer) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.flush();
    }, 4000);
  }

  private remove(id: string): void {
    this.jobs.update((list) => list.filter((j) => j.id !== id));
    this.persist();
  }

  private patch(id: string, patch: Partial<StaffOrderOutboxJob>): void {
    this.jobs.update((list) => list.map((j) => (j.id === id ? { ...j, ...patch } : j)));
    this.persist();
  }

  private persist(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.jobs()));
    } catch {
      /* quota / modo privado */
    }
  }
}
