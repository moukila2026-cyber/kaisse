/**
 * Enregistrement du service worker et repérage de l'état hors ligne.
 * Rien n'est mis en cache côté données : la démo locale et Supabase gardent
 * leurs propres mécanismes. Seule la coquille de l'application est servie
 * hors ligne pour éviter l'écran blanc en cas de coupure.
 */
export function registerServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  const isSecure = window.location.protocol === "https:" || window.location.hostname === "localhost";
  if (!isSecure) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.warn("Service worker non enregistré", error);
    });
  });
}

export function watchConnectivity(onChange) {
  if (typeof window === "undefined") return () => {};
  const update = () => onChange(navigator.onLine);
  update();
  window.addEventListener("online", update);
  window.addEventListener("offline", update);
  return () => {
    window.removeEventListener("online", update);
    window.removeEventListener("offline", update);
  };
}
