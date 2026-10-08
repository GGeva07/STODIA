import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.stodia.app',
  appName: 'STODIA',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    cleartext: true,
    allowNavigation: ['*'],
  },
  android: { allowMixedContent: true },
  plugins: {
    StatusBar: { style: 'DARK', backgroundColor: '#1D4ED8', overlaysWebView: false },
  },
};

export default config;
