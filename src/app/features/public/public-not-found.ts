import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-public-not-found',
  imports: [RouterLink, MatButtonModule],
  template: `
    <div class="nf">
      <p class="nf__eyebrow">Link no válido</p>
      <h1>No encontramos esta página</h1>
      <p class="nf__body">
        Revisá el link o pedí uno nuevo al local. Si sos del equipo, podés ingresar con tu usuario.
      </p>
      <div class="nf__actions">
        <a mat-stroked-button routerLink="/login">Ir a ingresar</a>
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
      min-height: 100vh;
      background: #f3f5f4;
      color: #1a2428;
      font-family: system-ui, sans-serif;
    }
    .nf {
      max-width: 28rem;
      margin: 0 auto;
      padding: 4rem 1.25rem;
      text-align: center;
    }
    .nf__eyebrow {
      margin: 0 0 0.5rem;
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: #5f6f76;
    }
    h1 {
      margin: 0 0 0.75rem;
      font-size: 1.55rem;
      line-height: 1.2;
    }
    .nf__body {
      margin: 0 0 1.5rem;
      color: #5f6f76;
      line-height: 1.45;
      font-size: 0.95rem;
    }
    .nf__actions {
      display: flex;
      justify-content: center;
      gap: 0.5rem;
    }
  `,
})
export class PublicNotFoundPage {}
