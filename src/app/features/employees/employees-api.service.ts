import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import type { UserVisibility } from '../../shared/user-visibility';

export type EmployeeType = 'FIXED' | 'ROTATING';

export type EmployeeShiftAssignment = {
  shiftId: string;
  type: EmployeeType;
};

export interface Employee {
  id: string;
  shopId: string;
  fullName: string;
  baseSalary: number;
  userId?: string | null;
  hireDate?: string | null;
  notes?: string | null;
  /** Resumen legacy: fijo si tiene al menos un turno fijo. */
  type: EmployeeType;
  /** Tipo por turno de caja. Vacío = aplica `type` a todos. */
  shiftAssignments?: EmployeeShiftAssignment[];
  /** Si cuenta para el presentismo semanal en liquidación. */
  countsForAttendanceBonus?: boolean;
  /** Si produce comida → aparece en asistencia de producción. */
  producesFood?: boolean;
  /** Productor supervisor a cargo. */
  supervisorEmployeeId?: string | null;
  /** Alias o CBU para reintegros. */
  bankAlias?: string | null;
  overtimeHourRate?: number;
  /** null = hereda el del local. */
  holidayPayMultiplier?: number | null;
  serviceCheckIn?: string | null;
  serviceCheckOut?: string | null;
  active: boolean;
}

export interface ShopUserOption {
  id: string;
  fullName: string;
  email: string;
  visibility?: Partial<UserVisibility> | null;
  hideFromCashWithdraw?: boolean;
}

@Injectable({ providedIn: 'root' })
export class EmployeesApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  list(shopId: string, includeInactive = false) {
    return this.http.get<Employee[]>(`${this.base}/shops/${shopId}/employees`, {
      params: includeInactive ? { includeInactive: 'true' } : {},
    });
  }

  create(shopId: string, body: Partial<Employee>) {
    return this.http.post<Employee>(`${this.base}/shops/${shopId}/employees`, body);
  }

  update(shopId: string, id: string, body: Partial<Employee>) {
    return this.http.patch<Employee>(`${this.base}/shops/${shopId}/employees/${id}`, body);
  }

  remove(shopId: string, id: string) {
    return this.http.delete<{ ok: boolean }>(`${this.base}/shops/${shopId}/employees/${id}`);
  }

  /** Usuarios del local, para vincular con un empleado. */
  shopUsers(shopId: string) {
    return this.http.get<ShopUserOption[]>(`${this.base}/users`, { params: { shopId } });
  }
}
