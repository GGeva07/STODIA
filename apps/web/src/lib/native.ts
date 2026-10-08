import { Capacitor } from '@capacitor/core';

export const isNative = Capacitor.isNativePlatform();

/** Inicialización solo en la app nativa: barra de estado, zoom bloqueado y botón atrás de Android. */
export async function initNative(where: () => { path: string; back: () => void }) {
  if (!isNative) return;
  document.querySelector('meta[name=viewport]')?.setAttribute(
    'content', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover');
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setOverlaysWebView({ overlay: false });
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: '#1D4ED8' });
  } catch { /* plugin no disponible */ }
  try {
    const { App } = await import('@capacitor/app');
    App.addListener('backButton', () => {
      const { path, back } = where();
      const root = ['/login', '/servidor', '/m/tutor', '/m/lista', '/m', '/'];
      if (root.includes(path.replace(/\/$/, '') || '/')) void App.exitApp();
      else back();
    });
  } catch { /* plugin no disponible */ }
}
