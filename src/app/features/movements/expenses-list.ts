import { Component } from '@angular/core';
import { MovementsListPage } from './movements-list';

@Component({
  selector: 'app-expenses-list-page',
  imports: [MovementsListPage],
  template: `<app-movements-list kind="expense" />`,
})
export class ExpensesListPage {}
