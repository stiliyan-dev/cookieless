self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open("cookieless-harness-sw").then((cache) =>
      cache.put(
        new Request("./sw-seed.txt", { cache: "reload" }),
        new Response("service-worker-seed", {
          headers: { "Content-Type": "text/plain" }
        })
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
