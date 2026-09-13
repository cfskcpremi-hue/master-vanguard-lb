export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 1. Tampilkan UI Dashboard Modern saat diakses di root (https://masterskc.multiskc.eu.cc/)
    if (url.pathname === "/" || url.pathname === "/dashboard") {
      return new Response(getDashboardHTML(), {
        headers: { "Content-Type": "text/html;charset=UTF-8" }
      });
    }

    // 2. API Endpoint untuk mengambil Status Worker & Statistik Data Usage
    if (url.pathname === "/api/status") {
      const workers = await getWorkersList(request, env);
      
      // Cek status kesehatan cepat (ping singkat) untuk tiap worker
      const workerStatusPromises = workers.map(async (workerUrl) => {
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
      
      // Simulasi data usage statistik (bisa dikembangkan sesuai kebutuhan)
      const stats = {
        totalWorkers: workers.length,
        activeWorkers: results.filter(w => w.status === "ACTIVE").length,
        limitedWorkers: results.filter(w => w.status === "LIMITED").length,
        deadWorkers: results.filter(w => w.status === "DEAD").length,
        estimatedDataUsageMB: (Math.random() * 500 + 120).toFixed(2), // Simulasi trafik data berjalan
        workers: results
      };

      return new Response(JSON.stringify(stats, null, 2), {
        headers: { "Content-Type": "application/json" }
      });
    }

    // 3. Logika Utama Load Balancer & Auto Failover VPN
    const workers = await getWorkersList(request, env);
    if (!workers || workers.length === 0) {
      return new Response("No workers found in workers.txt", { status: 503 });
    }

    const randomWorker = workers[Math.floor(Math.random() * workers.length)];
    const targetUrl = new URL(url.pathname + url.search, randomWorker);

    const modifiedRequest = new Request(targetUrl, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      redirect: "manual"
    });

    try {
      const response = await fetch(modifiedRequest);

      // Jika worker terkena limit (429) atau error server, otomatis pindah ke worker lain
      if ([429, 502, 503, 504].includes(response.status)) {
        const remainingWorkers = workers.filter(w => w !== randomWorker);
        if (remainingWorkers.length > 0) {
          const fallbackWorker = remainingWorkers[Math.floor(Math.random() * remainingWorkers.length)];
          const fallbackUrl = new URL(url.pathname + url.search, fallbackWorker);
          return await fetch(new Request(fallbackUrl, modifiedRequest));
        }
      }

      return response;

    } catch (err) {
      const remainingWorkers = workers.filter(w => w !== randomWorker);
      if (remainingWorkers.length > 0) {
        const fallbackWorker = remainingWorkers[Math.floor(Math.random() * remainingWorkers.length)];
        const fallbackUrl = new URL(url.pathname + url.search, fallbackWorker);
        return await fetch(new Request(fallbackUrl, modifiedRequest));
      }
      return new Response("Bad Gateway / All backends unreachable", { status: 502 });
    }
  }
};

async function getWorkersList(request, env) {
  try {
    const assetUrl = new URL("/workers.txt", request.url);
    const res = await env.ASSETS.fetch(new Request(assetUrl));
    if (res.ok) {
      const text = await res.text();
      return text.split("\n").map(line => line.trim()).filter(line => line.length > 0 && line.startsWith("http"));
    }
  } catch (e) {}
  return ["https://skcpusat.pages.dev"];
}

// Template HTML UI Dashboard Modern (Cyberpunk / Nordic Theme)
function getDashboardHTML() {
  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MasterSKC - Load Balancer Dashboard</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600;700&display=swap" rel="stylesheet">
  <style>
    body { font-family: 'Space Grotesk', sans-serif; background-color: #0b0f19; color: #f3f4f6; }
    .glass { background: rgba(17, 24, 39, 0.7); backdrop-filter: blur(12px); border: 1px solid rgba(255, 255, 255, 0.1); }
  </style>
</head>
<body class="min-h-screen p-4 md:p-8">
  <div class="max-w-5xl mx-auto space-y-6">
    
    <!-- Header -->
    <div class="glass p-6 rounded-2xl flex flex-col md:flex-row justify-between items-center gap-4 shadow-xl">
      <div>
        <h1 class="text-2xl font-bold tracking-wider text-cyan-400">⚡ MASTERSKC VANGUARD LB</h1>
        <p class="text-sm text-gray-400">Serverless Multi-Worker Load Balancer & Auto-Failover System</p>
      </div>
      <button onclick="fetchStatus()" id="refresh-btn" class="px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold rounded-xl transition shadow-lg shadow-cyan-900/40 text-sm">
        🔄 Refresh Status
      </button>
    </div>

    <!-- Statistik Cards -->
    <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
      <div class="glass p-5 rounded-2xl border-l-4 border-cyan-500">
        <p class="text-xs text-gray-400 uppercase tracking-wider">Total Nodes</p>
        <p id="stat-total" class="text-3xl font-bold mt-1 text-cyan-300">-</p>
      </div>
      <div class="glass p-5 rounded-2xl border-l-4 border-emerald-500">
        <p class="text-xs text-gray-400 uppercase tracking-wider">Active Workers</p>
        <p id="stat-active" class="text-3xl font-bold mt-1 text-emerald-400">-</p>
      </div>
      <div class="glass p-5 rounded-2xl border-l-4 border-amber-500">
        <p class="text-xs text-gray-400 uppercase tracking-wider">Limited (429)</p>
        <p id="stat-limited" class="text-3xl font-bold mt-1 text-amber-400">-</p>
      </div>
      <div class="glass p-5 rounded-2xl border-l-4 border-blue-500">
        <p class="text-xs text-gray-400 uppercase tracking-wider">Est. Data Usage</p>
        <p id="stat-usage" class="text-3xl font-bold mt-1 text-blue-400">- MB</p>
      </div>
    </div>

    <!-- List Worker Table -->
    <div class="glass rounded-2xl overflow-hidden shadow-xl">
      <div class="p-5 border-b border-gray-800 flex justify-between items-center">
        <h2 class="font-semibold text-lg text-gray-200">Daftar Status Node Worker & Pages</h2>
        <span class="text-xs text-cyan-400 animate-pulse">● Live Monitoring</span>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="bg-gray-900/50 text-gray-400 text-xs uppercase tracking-wider border-b border-gray-800">
              <th class="p-4">No</th>
              <th class="p-4">Worker URL</th>
              <th class="p-4">Latency</th>
              <th class="p-4">Status</th>
            </tr>
          </thead>
          <tbody id="worker-table-body" class="divide-y divide-gray-800 text-sm">
            <tr><td colspan="4" class="p-6 text-center text-gray-500">Memuat status worker...</td></tr>
          </tbody>
        </table>
      </div>
    </div>

  </div>

  <script>
    async function fetchStatus() {
      const btn = document.getElementById('refresh-btn');
      btn.textContent = "Checking...";
      try {
        const res = await fetch('/api/status');
        const data = await res.json();
        
        document.getElementById('stat-total').textContent = data.totalWorkers;
        document.getElementById('stat-active').textContent = data.activeWorkers;
        document.getElementById('stat-limited').textContent = data.limitedWorkers;
        document.getElementById('stat-usage').textContent = data.estimatedDataUsageMB + " MB";

        const tbody = document.getElementById('worker-table-body');
        tbody.innerHTML = '';

        data.workers.forEach((w, index) => {
          let badgeColor = "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
          if (w.status === "LIMITED") badgeColor = "bg-amber-500/10 text-amber-400 border-amber-500/20";
          if (w.status === "DEAD") badgeColor = "bg-rose-500/10 text-rose-400 border-rose-500/20";

          const tr = document.createElement('tr');
          tr.className = "hover:bg-gray-800/40 transition";
          tr.innerHTML = \`
            <td class="p-4 text-gray-500 font-mono">\${index + 1}</td>
            <td class="p-4 font-mono text-cyan-300 truncate max-w-xs"><a href="\${w.url}" target="_blank" class="hover:underline">\${w.url}</a></td>
            <td class="p-4 text-gray-300 font-mono">\${w.latency} ms</td>
            <td class="p-4"><span class="px-3 py-1 rounded-full text-xs font-semibold border \${badgeColor}">\${w.status}</span></td>
          \`;
          tbody.appendChild(tr);
        });
      } catch (e) {
        alert("Gagal memuat data status worker.");
      }
      btn.textContent = "🔄 Refresh Status";
    }

    // Auto load saat dibuka
    fetchStatus();
  </script>
</body>
</html>`;
}
