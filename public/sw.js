// Minimal service worker: satisfies browser install criteria.
// ponytail: no offline caching yet — add a cache-first strategy for static assets when real offline demo use is needed.
self.addEventListener("fetch", () => {});
