import { Component } from '@angular/core';
import { MovementsListPage } from './movements-list';

@Component({
  selector: 'app-transactions-list-page',
  imports: [MovementsListPage],
  template: `<app-movements-list kind="all" />`,
})
export class TransactionsListPage {}
