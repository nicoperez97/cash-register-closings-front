import { Directive, ElementRef, HostListener } from '@angular/core';

/** Permite coma decimal en inputs de monto (teclado AR / iPhone). */
@Directive({
  selector: 'input[appMoney]',
  standalone: true,
})
export class MoneyInputDirective {
  constructor(private readonly el: ElementRef<HTMLInputElement>) {
    const input = this.el.nativeElement;
    input.setAttribute('inputmode', 'decimal');
    input.setAttribute('enterkeyhint', 'done');
  }

  @HostListener('keydown', ['$event'])
  onKey(event: KeyboardEvent): void {
    if (event.key !== ',') return;
    event.preventDefault();
    const input = this.el.nativeElement;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;
    const next = `${input.value.slice(0, start)}.${input.value.slice(end)}`;
    input.value = next;
    input.setSelectionRange(start + 1, start + 1);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
}
