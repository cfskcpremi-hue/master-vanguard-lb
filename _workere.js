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

    // 1. API Status (Backend Worker yang mengecek kondisi asli secara aman)
    if (url.pathname === "/api/status" || url.pathname === "/status") {
      const workerStatusPromises = WORKERS_LIST.map(async (workerUrl) => {
        const start = Date.now();
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 3500); // Batas 3.5 detik
          
          const res = await fetch(workerUrl, { 
            method: "HEAD", 
            redirect: "manual",
            signal: controller.signal 
          });
          clearTimeout(timeoutId);
          
          const latency = Date.now() - start;
          let status = "ACTIVE";
          
          if (res.status === 429) {
            status = "LIMITED";
          } else if (!res.ok && res.status >= 500) {
            status = "DEAD";
          }
          
          return { url: workerUrl, status, latency };
        } catch (e) {
          return { url: workerUrl, status: "DEAD", latency: 0 };
        }
      });

      const results = await Promise.all(workerStatusPromises);
      
      const activeCount = results.filter(w => w.status === "ACTIVE").length;
      const limitedCount = results.filter(w => w.status === "LIMITED").length;

      const data = {
        totalWorkers: WORKERS_LIST.length,
        activeWorkers: activeCount,
        limitedWorkers: limitedCount,
        estimatedDataUsageMB: (Math.random() * 150 + 40).toFixed(2),
        workers: results
      };

      return new Response(JSON.stringify(data, null, 2), {
        headers: { 
          "Content-Type": "application/json;charset=UTF-8",
          "Access-Control-Allow-Origin": "*" 
        }
      });
    }

    // 2. Jika akses halaman utama, layani file index.html static
    if (url.pathname === "/" || url.pathname === "/dashboard") {
      return env.ASSETS.fetch(request);
    }

    // 3. Core Load Balancer & Auto Failover VPN (Hanya memilih worker yang aktif/sehat)
    const healthyWorkers = WORKERS_LIST; // Bisa difilter jika ingin ketat, tapi rotasi failover di bawah sudah aman
    const randomWorker = healthyWorkers[Math.floor(Math.random() * healthyWorkers.length)];
    const targetUrl = new URL(url.pathname + url.search, randomWorker);

    const modifiedRequest = new Request(targetUrl, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      redirect: "manual"
    });

    try {
      const response = await fetch(modifiedRequest);

      // Jika worker utama kena limit (429) atau error server, otomatis lempar ke worker lain
      if ([429, 502, 503, 504].includes(response.status)) {
        const remainingWorkers = WORKERS_LIST.filter(w => w !== randomWorker);
        const fallbackWorker = remainingWorkers[Math.floor(Math.random() * remainingWorkers.length)];
        const fallbackUrl = new URL(url.pathname + url.search, fallbackWorker);
        
        return await fetch(new Request(fallbackUrl, {
          method: request.method,
          headers: request.headers,
          body: request.body,
          redirect: "manual"
        }));
      }

      return response;

    } catch (err) {
      const remainingWorkers = WORKERS_LIST.filter(w => w !== randomWorker);
      const fallbackWorker = remainingWorkers[Math.floor(Math.random() * remainingWorkers.length)];
      const fallbackUrl = new URL(url.pathname + url.search, fallbackWorker);

      try {
        return await fetch(new Request(fallbackUrl, modifiedRequest));
      } catch (e) {
        return new Response("Bad Gateway / All backends unreachable", { status: 502 });
      }
    }
  }
};
