import { Component } from '@angular/core';
import { MovementsListPage } from './movements-list';

@Component({
  selector: 'app-account-transfers-list-page',
  imports: [MovementsListPage],
  template: `<app-movements-list kind="transfer" />`,
})
export class AccountTransfersListPage {}
