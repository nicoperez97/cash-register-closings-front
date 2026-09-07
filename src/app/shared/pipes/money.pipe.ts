import { Pipe, PipeTransform } from '@angular/core';
import { formatMoney, formatNumber, type FormatMoneyOptions } from '../utils/money';

/** Monto: miles con "." y millones con M ($10.000,00 · $1M). */
@Pipe({ name: 'money', standalone: true })
export class MoneyPipe implements PipeTransform {
  transform(value: number | string | null | undefined, compact = true): string {
    return formatMoney(value, { compact });
  }
}

/** Número sin $: 10.000 · 1M. */
@Pipe({ name: 'numFormat', standalone: true })
export class NumFormatPipe implements PipeTransform {
  transform(
    value: number | string | null | undefined,
    compact = true,
    maxFractionDigits = 2,
  ): string {
    return formatNumber(value, {
      compact,
      maximumFractionDigits: maxFractionDigits,
      minimumFractionDigits: 0,
    });
  }
}

export type { FormatMoneyOptions };
