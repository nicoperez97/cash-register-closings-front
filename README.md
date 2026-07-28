# Cash Register Closings Front

Angular 22 (base GlobalUY template) + Material para cierres de caja multi-local.

## Setup

```bash
npm install
npm start
```

Requiere la API en `http://localhost:3000` (`src/environments/environment.ts`).

## Login demo

| Email | Password | Rol |
|-------|----------|-----|
| admin@cierres.com | demo | ADMIN (ambos locales) |
| manager@cierres.com | demo | MANAGER (ambos) |
| cashier@cierres.com | demo | CASHIER (solo Al Panino) |

## Features

- Selector de local en el menú lateral
- Listado / alta / edición de cierres
- Importación desde ZIP de WhatsApp
- Reportes + export Excel
- Admin de usuarios y del local
- PWA instalable (build de producción)

## PWA

```bash
npm run build
# servir dist/cash-register-closings-front/browser por HTTPS (o localhost)
```

El service worker se registra solo fuera de `ng serve` (modo producción). En Chrome/Edge: Instalar app desde el ícono de la barra de direcciones.
