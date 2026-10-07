const fs = require('fs');
const path = require('path');

/**
 * app.json holds the configuration; this only adds the company's Firebase file when it is present. Push notifications
 * need mobile/google-services.json (from the Firebase project, never committed). Without it the app builds and works the
 * same, just without push.
 */
module.exports = ({ config }) => {
  if (fs.existsSync(path.join(__dirname, 'google-services.json'))) {
    config.android = { ...config.android, googleServicesFile: './google-services.json' };
  }
  return config;
};
