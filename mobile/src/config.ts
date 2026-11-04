import Constants from 'expo-constants';

/**
 * The CRM server this app talks to — digitechotg.in (live). A test build (app.config.js, POM_API_BASE) points it at a
 * test server instead, e.g. crm.sunexpert.in.
 */
const configured = (Constants.expoConfig?.extra as { apiBase?: string } | undefined)?.apiBase;
export const API_BASE = configured && /^https:\/\//.test(configured) ? configured : 'https://digitechotg.in/api/v1';
export const APP_NAME = 'POM POWER CRM';
