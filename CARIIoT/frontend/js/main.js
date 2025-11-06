/* ======================
   CONFIGURAÇÃO E DADOS
   ====================== */

// Lista de motes simulados
const MOTES = ['MOTE1', 'MOTE2', 'MOTE3', 'MOTE4', 'MOTE5', 'MOTE6'];

// Protocolos simulados
const PROTOCOLS = ['MQTT', 'CoAP', 'HTTP'];

// Array principal de dados
let DATA = [];

// Função auxiliar para gerar número aleatório float
function random(min, max) {
  return Math.random() * (max - min) + min;
}

// Função auxiliar para gerar número aleatório inteiro
function randInt(min, max) {
  return Math.floor(random(min, max + 1));
}

// Função debounce - evita execuções rápidas demais
function debounce(func, wait) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

/* ======================
   FIREBASE
   ====================== */

import { db } from './firebase-config.js';
import { ref, onValue } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js';

/* =========================
   REFERÊNCIAS DO DOM
   ========================= */

// Seletores dos elementos principais
const tabs = document.querySelectorAll('.tab');
const pages = {
  resumo: document.getElementById('page-resumo'),
  dispositivos: document.getElementById('page-dispositivos'),
  infra: document.getElementById('page-infra'),
  eventos: document.getElementById('page-eventos'),
  tendencias: document.getElementById('page-tendencias'),
  config: document.getElementById('page-config'),
};
const fMote = document.getElementById('filterMote');
const fProt = document.getElementById('filterProtocol');
const fSource = document.getElementById('filterSource');
const timeRange = document.getElementById('timeRange');
const refreshBtn = document.getElementById('refreshBtn');
const fileInput = document.getElementById('fileInput');
const selMoteDet = document.getElementById('selectMoteDetails');

/* ==========================
   POPULAÇÃO DE FILTROS
   ========================== */

// Função para popular filtros com base nos dados
function populateFiltersFromData() {
  const motes = Array.from(new Set(DATA.map((d) => d.mote))).sort();
  const prots = Array.from(new Set(DATA.map((d) => d.protocol))).sort();

  fMote.innerHTML = '<option value="">Todos os Motes</option>';
  selMoteDet.innerHTML = '';

  for (const m of motes) {
    fMote.appendChild(
      Object.assign(document.createElement('option'), {
        value: m,
        textContent: m,
      })
    );
    selMoteDet.appendChild(
      Object.assign(document.createElement('option'), {
        value: m,
        textContent: m,
      })
    );
  }
  fProt.innerHTML = '<option value="">Todos os Protocolos</option>';
  for (const p of prots) {
    fProt.appendChild(
      Object.assign(document.createElement('option'), {
        value: p,
        textContent: p,
      })
    );
  }
}
// Função para assinar dados do Realtime Database e popular DATA
// Assumimos por padrão que os dados estão em um nó chamado 'Sheet1'.
// Altere o path em subscribeFirebase() se estiver em outro nó.
function subscribeFirebase(path = 'Sheet1') {
  try {
    const dbRef = ref(db, path);
    onValue(
      dbRef,
      (snapshot) => {
        const val = snapshot.val();
        if (!val) {
          console.log('Firebase: nó vazio em', path);
          return;
        }
        // Se for array já usa; se for objeto (mapa por id) converte para array
        if (Array.isArray(val)) {
          DATA = val;
        } else if (typeof val === 'object') {
          DATA = Object.values(val);
        } else {
          console.warn('Firebase: formato de dados inesperado em', path);
          return;
        }
        // Normaliza/transforma campos do seu JSON para o formato aceito pelo dashboard
        DATA = DATA.map((r) => {
          // timestamp: aceita number (ms) ou string ISO nos campos ts/time
          const rawTs = r.ts ?? r.time ?? r.Time ?? r.timestamp ?? '';
          let ts;
          if (typeof rawTs === 'number') {
            ts = new Date(rawTs).toISOString();
          } else if (typeof rawTs === 'string') {
            const d = new Date(rawTs);
            ts = isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
          } else {
            ts = new Date().toISOString();
          }

          const mote = r.mote ?? (r.node_id ? 'MOTE' + r.node_id : r.node ?? 'MOTE?');
          const protocol = r.protocol ?? r.protocolo ?? '';
          const event = r.event ?? r.evento ?? 'Normal';
          const source = r.source ?? r.origem ?? 'Mote';

          const packetLoss = Number(r.packetLoss ?? r.perda_pacotes ?? r.perda ?? 0) || 0;
          const jitter = Number(r.jitter ?? 0) || 0;
          const rssi = Number(r.rssi ?? 0) || 0;
          const cpu = Number(r.cpu ?? 0) || 0;
          const ram = Number(r.ram ?? 0) || 0;
          const energy = Number(r.energy ?? r.consumo_energia ?? 0) || 0;

          return {
            ts,
            mote,
            protocol,
            event,
            packetLoss,
            jitter,
            rssi,
            cpu,
            ram,
            energy,
            source,
          };
        });
        populateFiltersFromData();
        renderAll();
        console.log('Firebase: dados carregados (', DATA.length, 'registros)');
      },
      (err) => console.error('Firebase read error:', err)
    );
  } catch (err) {
    console.error('subscribeFirebase error', err);
  }
}

// Popula filtros ao carregar
populateFiltersFromData();

/* ==========================
   NAVEGAÇÃO ENTRE ABAS
   ========================== */

// Adiciona listeners para navegação entre abas
tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    const key = tab.dataset.tab;
    tabs.forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    Object.keys(pages).forEach((k) => {
      pages[k].style.display = k === key ? 'flex' : 'none';
    });
    renderActiveTab(); // Renderiza apenas aba ativa
  });
});

/* ==========================
   LISTENERS DE EVENTOS
   ========================== */

// Atualiza dados ao clicar em Atualizar
refreshBtn.addEventListener('click', renderAll);

// Aplica filtros e atualiza gráficos ao mudar seleção
const debouncedRender = debounce(renderAll, 300);
[fMote, fProt, fSource, timeRange].forEach((el) =>
  el.addEventListener('change', debouncedRender)
);

// Renderiza série e KPIs do dispositivo selecionado
selMoteDet.addEventListener('change', () => {
  renderDeviceSeries(selMoteDet.value);
  renderDeviceKpis(selMoteDet.value);
});

/* ==========================
   UPLOAD DE ARQUIVOS
   ========================== */

/* Upload de arquivos JSON/CSV */
fileInput.addEventListener('change', async (ev) => {
  const f = ev.target.files[0];
  if (!f) return;
  const txt = await f.text();
  try {
    // Detecta formato do arquivo
    if (f.name.toLowerCase().endsWith('.json')) {
      const parsed = JSON.parse(txt);
      if (Array.isArray(parsed)) {
        DATA = parsed;
      } else {
        alert('JSON deve ser um array de objetos');
        return;
      }
    } else {
      // Parse de CSV simples
      const lines = txt.split(/\r?\n/).filter(Boolean);
      const header = lines.shift().split(',');
      DATA = lines.map((l) => {
        const vals = l.split(',');
        const obj = {};
        header.forEach((h, i) => (obj[h.trim()] = vals[i] ? vals[i].trim() : ''));
        return {
          ts: obj.ts || new Date().toISOString(),
          mote: obj.mote || obj.Mote || 'MOTE?',
          protocol: obj.protocol || 'MQTT',
          event: obj.event || 'Normal',
          packetLoss: parseFloat(obj.packetLoss || obj.PacketLoss || 0),
          jitter: parseFloat(obj.jitter || 0),
          rssi: parseFloat(obj.rssi || 0),
          cpu: parseFloat(obj.cpu || 0),
          ram: parseFloat(obj.ram || 0),
          energy: parseFloat(obj.energy || 0),
          source: obj.source || 'Mote',
        };
      });
    }
    populateFiltersFromData();
    renderAll();
  } catch (err) {
    alert('Erro ao ler arquivo: ' + err.message);
  }
});

/* ==========================
   FUNÇÕES DE AGREGACAO E FILTRO
   ========================== */

// Aplica filtros dos controles a DATA
function applyFilters(data) {
  const moteFilter = fMote.value;
  const protFilter = fProt.value;
  const srcFilter = fSource.value;
  const minutes = parseInt(timeRange.value, 10) || 15;
  const since = Date.now() - minutes * 60000;
  return data.filter((d) => {
    const t = new Date(d.ts).getTime();
    if (t < since) return false;
    if (moteFilter && d.mote !== moteFilter) return false;
    if (protFilter && d.protocol !== protFilter) return false;
    if (srcFilter && d.source !== srcFilter) return false;
    return true;
  });
}

// KPIs agregados do último timestamp
function aggLatest(filtered) {
  if (filtered.length === 0) return {};
  const lastTs = filtered[filtered.length - 1].ts;
  const rows = filtered.filter((r) => r.ts === lastTs);
  const loss = rows.reduce((s, r) => s + (r.packetLoss || 0), 0) / rows.length;
  const jitter = rows.reduce((s, r) => s + (r.jitter || 0), 0) / rows.length;
  const cpuHostRows = filtered.filter((r) => r.source === 'Host');
  const cpuHost =
    cpuHostRows.length > 0
      ? cpuHostRows.reduce((s, r) => s + (r.cpu || 0), 0) / cpuHostRows.length
      : 0;
  const cpuMoteRows = filtered.filter((r) => r.source === 'Mote');
  const cpuMote =
    cpuMoteRows.length > 0
      ? cpuMoteRows.reduce((s, r) => s + (r.cpu || 0), 0) / cpuMoteRows.length
      : 0;
  const energy = filtered.reduce((s, r) => s + (r.energy || 0), 0) / filtered.length;
  const eventRate = filtered.filter(
    (r) => r.event !== 'Normal' && new Date(r.ts) > new Date(Date.now() - 60000)
  ).length;
  return { loss, jitter, cpuHost, cpuMote, energy, eventRate };
}

// Agregação para gráficos de séries
function aggregateForChart(filtered) {
  const buckets = {};
  filtered.forEach((d) => {
    const t = new Date(d.ts);
    const key = new Date(
      t.getFullYear(),
      t.getMonth(),
      t.getDate(),
      t.getHours(),
      t.getMinutes()
    ).toISOString();
    if (!buckets[key]) buckets[key] = { loss: 0, jitter: 0, count: 0 };
    buckets[key].loss += d.packetLoss;
    buckets[key].jitter += d.jitter;
    buckets[key].count++;
  });
  const labels = Object.keys(buckets).sort();
  return {
    labels: labels.map((l) => new Date(l).toLocaleTimeString()),
    loss: labels.map((k) => buckets[k].loss / buckets[k].count),
    jitter: labels.map((k) => buckets[k].jitter / buckets[k].count),
  };
}

/* ==========================
   INSTÂNCIAS DE GRÁFICOS
   ========================== */
let timeChart = null,
  topChart = null,
  deviceSeries = null,
  hostSeries = null,
  topProcesses = null,
  scatterChart = null,
  compareChart = null;

/* ==========================
   FUNÇÕES DE RENDERIZAÇÃO
   ========================== */

// Função auxiliar para pegar cor do tema
function themeColor(key) {
  return getComputedStyle(document.documentElement).getPropertyValue(key).trim();
}

// Renderiza KPIs principais
function renderKPIs() {
  const f = applyFilters(DATA);
  const a = aggLatest(f);
  document.getElementById('kpiPacketLoss').textContent =
    a.loss === undefined ? '—' : (a.loss * 100).toFixed(2) + '%';
  document.getElementById('kpiJitter').textContent =
    a.jitter === undefined ? '—' : Math.round(a.jitter) + ' ms';
  document.getElementById('kpiCpuHost').textContent =
    a.cpuHost ? Math.round(a.cpuHost) + '%' : '—';
  document.getElementById('kpiCpuMote').textContent =
    a.cpuMote ? Math.round(a.cpuMote) + '%' : '—';
  document.getElementById('kpiEnergy').textContent =
    a.energy ? Math.round(a.energy) + ' mW' : '—';
  document.getElementById('kpiEventRate').textContent =
    a.eventRate !== undefined ? a.eventRate + ' /min' : '—';
}

// Renderiza gráfico de séries temporais (PacketLoss/Jitter)
function renderTimeSeries() {
  const f = applyFilters(DATA);
  const s = aggregateForChart(f);
  const ctx = document.getElementById('timeChart').getContext('2d');
  if (timeChart) {
    let changed = false;
    if (JSON.stringify(timeChart.data.labels) !== JSON.stringify(s.labels)) {
      timeChart.data.labels = s.labels;
      changed = true;
    }
    if (
      JSON.stringify(timeChart.data.datasets[0].data) !==
      JSON.stringify(s.loss.map((x) => x * 100))
    ) {
      timeChart.data.datasets[0].data = s.loss.map((x) => x * 100);
      changed = true;
    }
    if (JSON.stringify(timeChart.data.datasets[1].data) !== JSON.stringify(s.jitter)) {
      timeChart.data.datasets[1].data = s.jitter;
      changed = true;
    }
    if (changed) timeChart.update();
  } else {
    timeChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: s.labels,
        datasets: [
          {
            label: 'Perda de Pacotes %',
            data: s.loss.map((x) => x * 100),
            borderColor: themeColor('--accent2'),
            backgroundColor: 'rgba(250,164,92,0.09)',
            yAxisID: 'A',
            tension: 0.25,
          },
          {
            label: 'Jitter ms',
            data: s.jitter,
            borderColor: themeColor('--accent3'),
            backgroundColor: 'rgba(115,176,186,0.13)',
            yAxisID: 'B',
            tension: 0.25,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        scales: {
          A: { position: 'left', ticks: { color: themeColor('--accent2') } },
          B: { position: 'right', ticks: { color: themeColor('--accent3') } },
        },
      },
    });
  }
}

// Renderiza feed de eventos e tabela de últimas leituras
function renderEventsFeed() {
  const f = applyFilters(DATA).slice(-200).reverse();
  const tbody = document.querySelector('#eventsFeed tbody');
  tbody.innerHTML = '';
  f.slice(0, 10).forEach((r) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td style="color:${themeColor(
      '--muted'
    )}">${new Date(r.ts).toLocaleTimeString()}</td><td>${r.mote}</td><td style="color:${
      r.event === 'Normal'
        ? themeColor('--accent3')
        : r.event.includes('DoS')
        ? themeColor('--danger')
        : themeColor('--accent2')
    }">${r.event}</td><td>${(r.packetLoss * 100).toFixed(2)}%</td>`;
    tbody.appendChild(tr);
  });
  const lt = document.querySelector('#latestTable tbody');
  lt.innerHTML = '';
  f.slice(0, 50).forEach((r) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td style="color:${themeColor('--muted')}">${new Date(
      r.ts
    ).toLocaleString()}</td><td>${r.mote}</td><td>${r.protocol}</td><td>${r.event}</td><td>${(
      r.packetLoss * 100
    ).toFixed(2)}%</td><td>${Math.round(r.jitter)} ms</td><td>${r.rssi} dBm</td>`;
    lt.appendChild(tr);
  });
}

// Função para cor do heatmap
function heatColor(v) {
  // Gradiente das cores do tema
  const r = Math.round(250 * Math.min(1, v * 1.4));
  const g = Math.round(176 * (1 - v));
  const b = Math.round(92 * (1 - v));
  return `rgb(${r},${g},${b})`;
}

// Renderiza heatmap pequeno
function renderHeatmapSmall() {
  const f = applyFilters(DATA);
  const cont = document.getElementById('heatmapArea');
  cont.innerHTML = '';
  const motes = Array.from(new Set(f.map((d) => d.mote))).slice(0, 12);
  if (motes.length === 0) {
    cont.textContent = 'Sem dados no período selecionado';
    return;
  }
  motes.forEach((m) => {
    const row = document.createElement('div');
    row.className = 'heat-row';
    for (let h = 0; h < 24; h++) {
      const v =
        Math.min(1, Math.abs(Math.sin((h + m.length) / 6)) * 0.35) +
        (m === 'MOTE3' ? 0.25 : 0);
      const c = document.createElement('div');
      c.className = 'heat-cell';
      c.style.background = heatColor(v);
      c.title = `${m} ${h}:00 = ${(v * 100).toFixed(1)}%`;
      row.appendChild(c);
    }
    cont.appendChild(row);
  });
}

// Renderiza gráfico de barras dos motes com maior perda
function renderTopChart() {
  const f = applyFilters(DATA);
  const agg = {};
  f.forEach((d) => (agg[d.mote] = (agg[d.mote] || 0) + d.packetLoss));
  const items = Object.entries(agg)
    .map(([k, v]) => ({
      k,
      v: v / Math.max(1, f.filter((x) => x.mote === k).length),
    }))
    .sort((a, b) => b.v - a.v);
  const labels = items.slice(0, 6).map((i) => i.k);
  const values = items.slice(0, 6).map((i) => i.v * 100);
  const ctx = document.getElementById('topChart').getContext('2d');
  if (topChart) {
    let changed = false;
    if (JSON.stringify(topChart.data.labels) !== JSON.stringify(labels)) {
      topChart.data.labels = labels;
      changed = true;
    }
    if (JSON.stringify(topChart.data.datasets[0].data) !== JSON.stringify(values)) {
      topChart.data.datasets[0].data = values;
      changed = true;
    }
    if (changed) topChart.update();
  } else {
    topChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Perda de Pacotes % (média)',
            data: values,
            backgroundColor: themeColor('--accent2'),
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
      },
    });
  }
}

// Renderiza série de dispositivo selecionado
function renderDeviceSeries(mote) {
  const f = applyFilters(DATA).filter((d) => d.mote === mote);
  const s = f.slice(-120);
  const labels = s.map((x) => new Date(x.ts).toLocaleTimeString());
  const loss = s.map((x) => x.packetLoss * 100);
  const jitter = s.map((x) => x.jitter);
  const ctx = document.getElementById('deviceSeries').getContext('2d');
  if (deviceSeries) {
    let changed = false;
    if (JSON.stringify(deviceSeries.data.labels) !== JSON.stringify(labels)) {
      deviceSeries.data.labels = labels;
      changed = true;
    }
    if (JSON.stringify(deviceSeries.data.datasets[0].data) !== JSON.stringify(loss)) {
      deviceSeries.data.datasets[0].data = loss;
      changed = true;
    }
    if (JSON.stringify(deviceSeries.data.datasets[1].data) !== JSON.stringify(jitter)) {
      deviceSeries.data.datasets[1].data = jitter;
      changed = true;
    }
    if (changed) deviceSeries.update();
  } else {
    deviceSeries = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Perda de Pacotes %',
            data: loss,
            borderColor: themeColor('--accent2'),
            backgroundColor: 'rgba(250,164,92,0.09)',
            tension: 0.25,
          },
          {
            label: 'Jitter ms',
            data: jitter,
            borderColor: themeColor('--accent3'),
            backgroundColor: 'rgba(115,176,186,0.13)',
            tension: 0.25,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
      },
    });
  }
}

// Renderiza KPIs do dispositivo selecionado
function renderDeviceKpis(mote) {
  const rows = applyFilters(DATA).filter((d) => d.mote === mote);
  if (rows.length === 0) {
    ['d_kpi_loss', 'd_kpi_jitter', 'd_kpi_rssi', 'd_kpi_cpu', 'd_kpi_ram'].forEach(
      (id) => (document.getElementById(id).textContent = '—')
    );
    return;
  }
  const last = rows[rows.length - 1];
  document.getElementById('d_kpi_loss').textContent = (last.packetLoss * 100).toFixed(2) + '%';
  document.getElementById('d_kpi_jitter').textContent = Math.round(last.jitter) + ' ms';
  document.getElementById('d_kpi_rssi').textContent =
    Math.round(rows.reduce((s, r) => s + r.rssi, 0) / rows.length) + ' dBm';
  document.getElementById('d_kpi_cpu').textContent =
    Math.round(rows.reduce((s, r) => s + r.cpu, 0) / rows.length) + '%';
  document.getElementById('d_kpi_ram').textContent =
    Math.round(rows.reduce((s, r) => s + r.ram, 0) / rows.length) + '%';
}

// Renderiza gráficos de host (infra)
function renderHostSeries() {
  const f = applyFilters(DATA).filter((d) => d.source === 'Host');
  const s = f.slice(-120);
  const labels = s.map((x) => new Date(x.ts).toLocaleTimeString());
  const cpu = s.map((x) => x.cpu);
  const ram = s.map((x) => x.ram);
  const ctx = document.getElementById('hostSeries').getContext('2d');
  if (hostSeries) {
    let changed = false;
    if (JSON.stringify(hostSeries.data.labels) !== JSON.stringify(labels)) {
      hostSeries.data.labels = labels;
      changed = true;
    }
    if (JSON.stringify(hostSeries.data.datasets[0].data) !== JSON.stringify(cpu)) {
      hostSeries.data.datasets[0].data = cpu;
      changed = true;
    }
    if (JSON.stringify(hostSeries.data.datasets[1].data) !== JSON.stringify(ram)) {
      hostSeries.data.datasets[1].data = ram;
      changed = true;
    }
    if (changed) hostSeries.update();
  } else {
    hostSeries = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'CPU %',
            data: cpu,
            borderColor: themeColor('--accent2'),
            backgroundColor: 'rgba(250,164,92,0.10)',
            tension: 0.25,
          },
          {
            label: 'RAM %',
            data: ram,
            borderColor: themeColor('--accent3'),
            backgroundColor: 'rgba(115,176,186,0.13)',
            tension: 0.25,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
      },
    });
  }
  document.getElementById('infra_cpu').textContent = cpu.length
    ? Math.round(cpu.reduce((s, v) => s + v, 0) / cpu.length) + '%'
    : '—';
  document.getElementById('infra_ram').textContent = ram.length
    ? Math.round(ram.reduce((s, v) => s + v, 0) / ram.length) + '%'
    : '—';
  document.getElementById('infra_disk').textContent = randInt(5, 50) + ' MB/s';
  document.getElementById('infra_net').textContent = randInt(10, 100) + ' MB/s';
}

// Renderiza timeline de eventos
function renderTimeline() {
  const f = applyFilters(DATA).filter((d) => d.event !== 'Normal').slice(-200).reverse();
  const tbody = document.querySelector('#timelineTable tbody');
  tbody.innerHTML = '';
  f.forEach((r) => {
    const tr = document.createElement('tr');
    tr.style.cursor = 'pointer';
    tr.innerHTML = `<td style="color:${themeColor('--muted')}">${new Date(
      r.ts
    ).toLocaleString()}</td><td>${r.mote}</td><td>${r.event}</td><td style="color:${
      r.event.includes('DoS') ? themeColor('--danger') : themeColor('--accent2')
    }">Alta</td>`;
    tr.addEventListener('click', () => {
      document.getElementById('eventDetails').innerHTML = `
        <strong>Detalhes do Evento</strong><br>
        <strong>Timestamp:</strong> ${new Date(r.ts).toLocaleString()}<br>
        <strong>Mote:</strong> ${r.mote}<br>
        <strong>Evento:</strong> ${r.event}<br>
        <strong>Perda de Pacotes:</strong> ${(r.packetLoss * 100).toFixed(2)}%<br>
        <strong>Jitter:</strong> ${r.jitter} ms<br>
        <strong>RSSI:</strong> ${r.rssi} dBm<br>
        <strong>Protocolo:</strong> ${r.protocol}
      `;
    });
    tbody.appendChild(tr);
  });
}

// Renderiza gráfico de top processos (infra)
function renderTopProcesses() {
  const labels = ['Prometheus', 'InfluxDB', 'Push Gateway'];
  const cpuValues = labels.map(() => randInt(10, 80));
  const ramValues = labels.map(() => randInt(10, 80));
  const ctx = document.getElementById('topProcesses').getContext('2d');
  if (topProcesses) {
    let changed = false;
    if (JSON.stringify(topProcesses.data.labels) !== JSON.stringify(labels)) {
      topProcesses.data.labels = labels;
      changed = true;
    }
    if (JSON.stringify(topProcesses.data.datasets[0].data) !== JSON.stringify(cpuValues)) {
      topProcesses.data.datasets[0].data = cpuValues;
      changed = true;
    }
    if (JSON.stringify(topProcesses.data.datasets[1].data) !== JSON.stringify(ramValues)) {
      topProcesses.data.datasets[1].data = ramValues;
      changed = true;
    }
    if (changed) topProcesses.update();
  } else {
    topProcesses = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'CPU (%)',
            data: cpuValues,
            backgroundColor: themeColor('--accent2'),
            borderRadius: 0,
            maxBarThickness: 22,
          },
          {
            label: 'RAM (%)',
            data: ramValues,
            backgroundColor: themeColor('--accent3'),
            borderRadius: 0,
            maxBarThickness: 22,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y',
        plugins: {
          legend: {
            display: true,
            position: 'top',
            labels: {
              color: themeColor('--muted'),
              font: {
                family: 'Segoe UI, Inter, Roboto, Arial, sans-serif',
                size: 13,
                weight: 'normal',
              },
              boxWidth: 14,
              boxHeight: 14,
              padding: 10,
              usePointStyle: true,
              pointStyle: 'rect',
            },
          },
        },
        scales: {
          x: {
            title: {
              display: true,
              text: 'Consumo (%)',
              color: themeColor('--muted'),
              font: {
                family: 'Segoe UI, Inter, Roboto, Arial, sans-serif',
                size: 13,
                weight: 'normal',
              },
            },
            ticks: {
              color: themeColor('--muted'),
              font: {
                family: 'Segoe UI, Inter, Roboto, Arial, sans-serif',
                size: 13,
              },
            },
            grid: {
              color: 'rgba(93,227,250,0.08)',
            },
          },
          y: {
            ticks: {
              color: themeColor('--text'),
              font: {
                family: 'Segoe UI, Inter, Roboto, Arial, sans-serif',
                size: 13,
              },
            },
            grid: {
              color: 'rgba(93,227,250,0.04)',
            },
          },
        },
      }
    });
  }
}

// Renderiza gráfico de dispersão RSSI x PacketLoss
function renderScatter() {
  const f = applyFilters(DATA);
  const agg = {};
  f.forEach((d) => {
    if (!agg[d.mote]) agg[d.mote] = { loss: 0, rssi: 0, count: 0 };
    agg[d.mote].loss += d.packetLoss;
    agg[d.mote].rssi += d.rssi;
    agg[d.mote].count++;
  });
  const sample = Object.keys(agg).map((k) => ({
    mote: k,
    loss: (agg[k].loss / agg[k].count) * 100,
    rssi: agg[k].rssi / agg[k].count,
  }));
  const ctx = document.getElementById('scatterChart').getContext('2d');
  const datasets = sample.map((s) => ({
    label: s.mote,
    data: [{ x: s.rssi, y: s.loss, r: 6 + Math.random() * 6 }],
    backgroundColor: themeColor('--accent3'),
  }));
  if (scatterChart) {
    let changed = false;
    if (JSON.stringify(scatterChart.data.datasets) !== JSON.stringify(datasets)) {
      scatterChart.data.datasets = datasets;
      changed = true;
    }
    if (changed) scatterChart.update();
  } else {
    scatterChart = new Chart(ctx, {
      type: 'bubble',
      data: {
        datasets: datasets,
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { title: { display: true, text: 'RSSI (dBm)' } },
          y: { title: { display: true, text: 'Perda de Pacotes (%)' } },
        },
      },
    });
  }
}

// Renderiza gráfico comparativo de janelas
function renderCompare() {
  const labels = [];
  const a = [],
    b = [];
  for (let i = 23; i >= 0; i--) {
    labels.push(`${i}h`);
    a.push(Math.abs(Math.sin(i / 4)) * 5 + Math.random() * 1);
    b.push(Math.abs(Math.sin((i + 3) / 4)) * 5 + Math.random() * 1);
  }
  const ctx = document.getElementById('compareChart').getContext('2d');
  const datasets = [
    {
      label: 'Últimas 24h',
      data: a,
      borderColor: themeColor('--accent2'),
      backgroundColor: 'rgba(250,164,92,0.10)',
      tension: 0.25,
    },
    {
      label: '24–48h',
      data: b,
      borderColor: themeColor('--accent3'),
      backgroundColor: 'rgba(115,176,186,0.13)',
      tension: 0.25,
    },
  ];
  if (compareChart) {
    let changed = false;
    if (JSON.stringify(compareChart.data.labels) !== JSON.stringify(labels)) {
      compareChart.data.labels = labels;
      changed = true;
    }
    if (JSON.stringify(compareChart.data.datasets) !== JSON.stringify(datasets)) {
      compareChart.data.datasets = datasets;
      changed = true;
    }
    if (changed) compareChart.update();
  } else {
    compareChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: datasets,
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
      },
    });
  }
}

// Renderiza imagem de simulação (SVG)
function renderSimImage() {
  const svg = encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='1200' height='600'><rect width='100%' height='100%' fill='#141b1c'/><circle cx='300' cy='300' r='80' fill='#5DE3FA' opacity='0.3'/><circle cx='600' cy='300' r='80' fill='#5DE3FA' opacity='0.5'/><circle cx='900' cy='300' r='80' fill='#FAA45C' opacity='0.7'/><text x='50%' y='50%' fill='#73B0BA' font-family='Segoe UI, Arial' font-size='24' text-anchor='middle'>Visualização da Topologia IoT</text><text x='50%' y='55%' fill='#696b7a' font-family='Segoe UI, Arial' font-size='14' text-anchor='middle'>(Substitua por imagem real da simulação)</text></svg>`
  );
  document.getElementById('simImage').src = `data:image/svg+xml;utf8,${svg}`;
}

// Renderiza heatmap grande (tendências)
function renderHeatmapBig() {
  const f = applyFilters(DATA);
  const cont = document.getElementById('heatmapBig');
  cont.innerHTML = '';
  const motes = Array.from(new Set(f.map((d) => d.mote)));
  if (motes.length === 0) {
    cont.textContent = 'Sem dados no período selecionado';
    return;
  }
  const headerRow = document.createElement('div');
  headerRow.style.display = 'flex';
  headerRow.style.gap = '4px';
  headerRow.style.marginBottom = '6px';
  headerRow.innerHTML = '<div style="width:60px;font-size:11px;color:' + themeColor('--muted') + '"></div>';
  for (let h = 0; h < 24; h++) {
    const cell = document.createElement('div');
    cell.style.flex = '1';
    cell.style.fontSize = '10px';
    cell.style.color = themeColor('--muted');
    cell.style.textAlign = 'center';
    cell.textContent = h;
    headerRow.appendChild(cell);
  }
  cont.appendChild(headerRow);
  motes.forEach((mote) => {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.gap = '4px';
    row.style.marginBottom = '6px';
    const label = document.createElement('div');
    label.style.width = '60px';
    label.style.fontSize = '11px';
    label.style.color = themeColor('--accent');
    label.textContent = mote;
    row.appendChild(label);
    for (let hour = 0; hour < 24; hour++) {
      const value =
        Math.min(1, Math.abs(Math.sin((hour + mote.length) / 6)) * 0.35) +
        (mote === 'MOTE3' ? 0.25 : 0);
      const cell = document.createElement('div');
      cell.className = 'heat-cell';
      cell.style.background = heatColor(value);
      cell.title = `${mote} ${hour}:00 = ${(value * 100).toFixed(1)}%`;
      row.appendChild(cell);
    }
    cont.appendChild(row);
  });
}

/* ==========================
   RENDERIZAÇÃO INTELIGENTE
   ========================== */

// Renderiza aba ativa com base na navegação
function renderActiveTab() {
  const activeTab = document.querySelector('.tab.active').dataset.tab;
  switch (activeTab) {
    case 'resumo':
      renderKPIs();
      renderTimeSeries();
      renderEventsFeed();
      renderHeatmapSmall();
      renderTopChart();
      renderSimImage();
      break;
    case 'dispositivos':
      if (selMoteDet.options.length > 0) {
        const mote = selMoteDet.value || selMoteDet.options[0].value;
        renderDeviceSeries(mote);
        renderDeviceKpis(mote);
      }
      break;
    case 'infra':
      renderHostSeries();
      renderTopProcesses();
      break;
    case 'eventos':
      renderTimeline();
      break;
    case 'tendencias':
      renderHeatmapBig();
      renderScatter();
      renderCompare();
      break;
    case 'config':
      // Aba estática
      break;
  }
}

// Atualiza todos os dados e filtros
function renderAll() {
  populateFiltersFromData();
  renderSimImage();
  renderActiveTab();
}

/* ==========================
   ATUALIZAÇÃO EM TEMPO REAL
   ========================== */

// Atualiza dados em tempo real a cada 4 segundos
setInterval(() => {
  if (DATA.length === 0) return;
  for (let i = 0; i < 10; i++) {
    const idx = DATA.length - 1 - i;
    if (idx < 0) break;
    DATA[idx].packetLoss = Math.max(0, DATA[idx].packetLoss + (Math.random() - 0.5) * 0.002);
    DATA[idx].jitter = Math.max(1, DATA[idx].jitter + (Math.random() - 0.5) * 2);
  }
  renderActiveTab();
}, 4000);

/* Listener para reconhecimento de alertas */
document.getElementById('ackAll').addEventListener('click', () => {
  alert('Todos os alertas foram reconhecidos (feature simulada)');
});

/* ==========================
   INICIALIZAÇÃO
   ========================== */

// Renderiza todos os dados ao iniciar
 // Inicia assinatura do Firebase (nó padrão: 'Sheet1').
 // Altere o path se seus dados estiverem em outro nó (ex: 'readings' ou '/').
 try {
   subscribeFirebase('Sheet1');
 } catch (err) {
   console.warn('subscribeFirebase: não foi possível assinar automaticamente', err);
 }

 renderAll();

/* Log de inicialização */
console.log('✅ Dashboard IIoT carregado');
console.log(`📊 ${DATA.length} registros`);

