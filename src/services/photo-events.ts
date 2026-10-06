const listeners = new Set<() => void>(),
  stops = new Set<() => void>();
export function subscribePhotoChanges(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
export function notifyPhotoChanges() {
  for (const fn of listeners) fn();
}
export function subscribePhotoStop(fn: () => void) {
  stops.add(fn);
  return () => {
    stops.delete(fn);
  };
}
export function stopPhotoWork() {
  for (const fn of stops) fn();
}
