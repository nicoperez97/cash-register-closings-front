import { Component } from '@angular/core';
import { MovementsListPage } from './movements-list';
import { MovementKind } from './movements-api.service';

@Component({
  selector: 'app-incomes-list-page',
  imports: [MovementsListPage],
  template: `<app-movements-list [kind]="incomeKind" />`,
})
export class IncomesListPage {
  readonly incomeKind: MovementKind = 'income';
}
