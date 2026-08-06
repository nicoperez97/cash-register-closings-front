import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export type EmployeeType = 'FIXED' | 'ROTATING';

export interface Employee {
  id: string;
  shopId: string;
  fullName: string;
  baseSalary: number;
  userId?: string | null;
  hireDate?: string | null;
  notes?: string | null;
  /** Fijo entra en “Todos presentes”; rotativo solo a mano. */
  type: EmployeeType;
  /** Si produce comida → aparece en asistencia de producción. */
  producesFood?: boolean;
  /** Productor supervisor a cargo. */
  supervisorEmployeeId?: string | null;
  active: boolean;
}

export interface ShopUserOption {
  id: string;
  fullName: string;
  email: string;
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
