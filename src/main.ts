import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { initSentry } from './app/core/monitoring/sentry';

bootstrapApplication(App, appConfig)
  .then(() => void initSentry())
  .catch((err) => console.error(err));
