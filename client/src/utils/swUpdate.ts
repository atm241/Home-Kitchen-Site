// Bridge between the service worker registration (set up in index.tsx, outside
// React) and the banner component that asks the user to reload.
//
// A new service worker installs in the background but sits in "waiting" until
// every tab of the app closes — on a phone PWA, that's approximately never. So
// without this, a deploy reaches nobody and users keep running an old build
// indefinitely. We surface the waiting worker and let the user apply it.

type UpdateListener = (registration: ServiceWorkerRegistration) => void;

let pendingRegistration: ServiceWorkerRegistration | null = null;
let listener: UpdateListener | null = null;

// Called by the service worker registration when a new build is ready.
export function notifyUpdateReady(registration: ServiceWorkerRegistration): void {
  pendingRegistration = registration;
  listener?.(registration);
}

// Subscribe the banner. The update may have landed before React mounted, so
// replay any registration we're already holding.
export function onUpdateReady(cb: UpdateListener): () => void {
  listener = cb;
  if (pendingRegistration) cb(pendingRegistration);
  return () => {
    listener = null;
  };
}

// Activate the waiting worker and reload once it takes control.
//
// The reload is driven by 'controllerchange' rather than called directly:
// reloading immediately can beat the new worker to activation, leaving the old
// build in place and making the banner look broken. The guard keeps a
// controllerchange fired for any other reason from reloading twice.
export function applyUpdate(registration: ServiceWorkerRegistration): void {
  const waiting = registration.waiting;
  if (!waiting) {
    window.location.reload();
    return;
  }

  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return;
    reloaded = true;
    window.location.reload();
  });

  waiting.postMessage({ type: 'SKIP_WAITING' });
}
