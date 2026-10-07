import { describe, expect, it } from 'vitest';
import { apiErrorMessage } from './api-error-message';

describe('apiErrorMessage', () => {
  it('never surfaces Angular HttpClient technical messages', () => {
    const err = {
      status: 500,
      statusText: 'Internal Server Error',
      url: 'http://localhost:4200/api/v1/public/shops/al-panino/ordering',
      message:
        'Http failure response for http://localhost:4200/api/v1/public/shops/al-panino/ordering: 500 Internal Server Error',
      error: null,
    };
    expect(apiErrorMessage(err, 'No pudimos cargar')).toBe(
      'Algo salió mal. Probá de nuevo en un rato.',
    );
  });

  it('uses friendly Nest business messages from the body', () => {
    const err = {
      status: 400,
      error: { message: 'El local está cerrado' },
    };
    expect(apiErrorMessage(err, 'Fallback')).toBe('El local está cerrado');
  });

  it('falls back on offline / status 0', () => {
    const err = { status: 0, error: null };
    expect(apiErrorMessage(err, 'Fallback')).toBe(
      'Sin conexión. Revisá la red e intentá de nuevo.',
    );
  });

  it('rejects class-validator english noise', () => {
    const err = {
      status: 400,
      error: { message: ['email must be an email'] },
    };
    expect(apiErrorMessage(err, 'Revisá los datos')).toBe('Revisá los datos');
  });
});
