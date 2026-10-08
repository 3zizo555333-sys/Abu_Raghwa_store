import { isPublicCustomerPath } from "@shared/pwaInstallability";

let serviceWorkerRegistrationRequested = false;

function ensureMeta(name: string, content: string) {
  let meta = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = name;
    document.head.append(meta);
  }
  meta.content = content;
}

function removeStaffInstallMetadata() {
  document.head.querySelector('link[rel="manifest"]')?.remove();
  [
    "mobile-web-app-capable",
    "apple-mobile-web-app-capable",
    "apple-mobile-web-app-status-bar-style",
    "apple-mobile-web-app-title",
  ].forEach(name => document.head.querySelector(`meta[name="${name}"]`)?.remove());
}

function addStaffInstallMetadata() {
  ensureMeta("mobile-web-app-capable", "yes");
  ensureMeta("apple-mobile-web-app-capable", "yes");
  ensureMeta("apple-mobile-web-app-status-bar-style", "default");
  ensureMeta("apple-mobile-web-app-title", "أبو رغوة");

  if (!document.head.querySelector('link[rel="manifest"]')) {
    const manifest = document.createElement("link");
    manifest.rel = "manifest";
    manifest.href = "/manifest.json";
    document.head.append(manifest);
  }
}

export function syncPwaInstallability(pathname: string) {
  if (isPublicCustomerPath(pathname)) {
    removeStaffInstallMetadata();
    return;
  }

  addStaffInstallMetadata();
  if ("serviceWorker" in navigator && !serviceWorkerRegistrationRequested) {
    serviceWorkerRegistrationRequested = true;
    void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // Installation is optional; a registration failure must never block login.
      serviceWorkerRegistrationRequested = false;
    });
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", event => {
    if (isPublicCustomerPath(window.location.pathname)) event.preventDefault();
  });
}
