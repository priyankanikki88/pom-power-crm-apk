const fs = require('fs');
const path = require('path');

/**
 * app.json holds the configuration; this only adds the company's Firebase file when it is present. Push notifications
 * need mobile/google-services.json (from the Firebase project, never committed). Without it the app builds and works the
 * same, just without push.
 *
 * POM_APP_VARIANT=test (set by the "Android APK" workflow when run by hand with a test server) builds a separate test app:
 * its own package id and name, so it installs next to the real app instead of replacing it, and it talks to
 * POM_API_BASE (e.g. https://crm.sunexpert.in/api/v1) instead of the live server.
 */
module.exports = ({ config }) => {
  if (fs.existsSync(path.join(__dirname, 'google-services.json'))) {
    config.android = { ...config.android, googleServicesFile: './google-services.json' };
  }
  if (process.env.POM_APP_VARIANT === 'test') {
    config.name = `${config.name} (Test)`;
    config.android = { ...config.android, package: `${config.android.package}.test` };
    // The Firebase file is registered for the real package only; the test app goes without push.
    delete config.android.googleServicesFile;
  }
  config.extra = { ...config.extra, apiBase: process.env.POM_API_BASE || undefined };
  return config;
};
