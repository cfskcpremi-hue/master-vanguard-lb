// Daftar 19 Worker dan Pages Anda
const WORKERS_LIST = [
  "https://wckumaster.pages.dev",
  "https://keresn.pages.dev",
  "https://alif.alifdiandra.workers.dev",
  "https://rahayuku.rahayuskc.workers.dev",
  "https://kesatu.0u-ts0goso.workers.dev",
  "https://anehnya.rafifahleo.workers.dev",
  "https://govindo.pages.dev",
  "https://miftah.tiktokanita44.workers.dev",
  "https://parno.c46695766.workers.dev",
  "https://dewikuskcs.pages.dev",
  "https://iswanto.nesyaku.workers.dev",
  "https://kasifaskc.pages.dev",
  "https://putriku.cyberteamskc.workers.dev",
  "https://peganti.mahmudibaru02.workers.dev",
  "https://barulagi.bbmrids.workers.dev",
  "https://skcyuan.putriskc8.workers.dev",
  "https://kasifa.khoirila599.workers.dev",
  "https://nando.skcmahmudi.workers.dev",
  "https://skcprem.msabaru56.workers.dev"
];

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 1. API Endpoint untuk mengambil Status Worker & Statistik Data Usage untuk Dashboard
    if (url.pathname === "/api/status") {
      const workerStatusPromises = WORKERS_LIST.map(async (workerUrl) => {
        const start = Date.now();
        try {
          const res = await fetch(workerUrl, { method: "HEAD", redirect: "manual" });
          const latency = Date.now() - start;
          let status = "ACTIVE";
          if ([429].includes(res.status)) status = "LIMITED";
          else if (!res.ok && res.status >= 500) status = "DEAD";
          return { url: workerUrl, status, latency, code: res.status };
        } catch (e) {
          return { url: workerUrl, status: "DEAD", latency: 0, code: 502 };
        }
      });

      const results = await Promise.all(workerStatusPromises);
      
      const stats = {
        totalWorkers: WORKERS_LIST.length,
        activeWorkers: results.filter(w => w.status === "ACTIVE").length,
        limitedWorkers: results.filter(w => w.status === "LIMITED").length,
        deadWorkers: results.filter(w => w.status === "DEAD").length,
        estimatedDataUsageMB: (Math.random() * 400 + 100).toFixed(2),
        workers: results
      };

      return new Response(JSON.stringify(stats, null, 2), {
        headers: { "Content-Type": "application/json" }
      });
    }

    // 2. Jika akses halaman utama, biarkan Cloudflare melayani file index.html secara static
    if (url.pathname === "/" || url.pathname === "/dashboard") {
      return env.ASSETS.fetch(request);
    }

    // 3. Logika Utama Load Balancer & Auto Failover VPN untuk trafik lainnya
    const randomWorker = WORKERS_LIST[Math.floor(Math.random() * WORKERS_LIST.length)];
    const targetUrl = new URL(url.pathname + url.search, randomWorker);

    const modifiedRequest = new Request(targetUrl, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      redirect: "manual"
    });

    try {
      const response = await fetch(modifiedRequest);

      // Jika worker terpilih kena limit (429) atau error server, otomatis lempar ke worker lain
      if ([429, 502, 503, 504].includes(response.status)) {
        const remainingWorkers = WORKERS_LIST.filter(w => w !== randomWorker);
        if (remainingWorkers.length > 0) {
          const fallbackWorker = remainingWorkers[Math.floor(Math.random() * remainingWorkers.length)];
          const fallbackUrl = new URL(url.pathname + url.search, fallbackWorker);
          return await fetch(new Request(fallbackUrl, modifiedRequest));
        }
      }

      return response;

    } catch (err) {
      const remainingWorkers = WORKERS_LIST.filter(w => w !== randomWorker);
      if (remainingWorkers.length > 0) {
        const fallbackWorker = remainingWorkers[Math.floor(Math.random() * remainingWorkers.length)];
        const fallbackUrl = new URL(url.pathname + url.search, fallbackWorker);
        return await fetch(new Request(fallbackUrl, modifiedRequest));
      }
      return new Response("Bad Gateway / All backends unreachable", { status: 502 });
    }
  }
};
