/* ======================
   CONFIGURAÇÃO E DADOS
   ====================== */

// Variável global para armazenar os dados carregados do Firebase
window.DATA = [];

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
  eventos: document.getElementById('page-eventos'),
  tendencias: document.getElementById('page-tendencias'),
  config: document.getElementById('page-config'),
};
const fMote = document.getElementById('filterMote');
const fProt = document.getElementById('filterProtocol');
const fSource = document.getElementById('filterSource');
const timeRange = document.getElementById('timeRange');
const refreshBtn = document.getElementById('refreshBtn');
const selMoteDet = document.getElementById('selectMoteDetails');

/* ==========================
   POPULAÇÃO DE FILTROS
   ========================== */

// Função para popular filtros com base nos dados
function populateFiltersFromData() {
  console.log('🔄 Populando filtros com', window.DATA.length, 'registros');
  
  const motes = Array.from(new Set(window.DATA.map((d) => d.mote))).sort();
  const prots = Array.from(new Set(window.DATA.map((d) => d.protocol))).sort();

  console.log('📊 Motes encontrados:', motes);
  console.log('📊 Protocolos encontrados:', prots);

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

/* ==========================
   INSTÂNCIAS DE GRÁFICOS
   ========================== */
let timeChart = null,
  topChart = null,
  deviceSeries = null,
  compareChart = null;

/* ==========================
   FUNÇÕES DE AGREGACAO E FILTRO
   ========================== */

// Aplica filtros dos controles a window.DATA
function applyFilters(data) {
  const moteFilter = fMote.value;
  const protFilter = fProt.value;
  const srcFilter = fSource.value;
  const minutes = parseInt(timeRange.value, 10) || 15;
  const since = Date.now() - minutes * 60000;
  
  const filtered = data.filter((d) => {
    const t = new Date(d.ts).getTime();
    if (t < since) return false;
    if (moteFilter && d.mote !== moteFilter) return false;
    if (protFilter && d.protocol !== protFilter) return false;
    if (srcFilter && d.source !== srcFilter) return false;
    return true;
  });
  
  console.log('🔍 Filtros aplicados:', { moteFilter, protFilter, srcFilter, minutes });
  console.log('📊 Dados filtrados:', filtered.length, 'de', data.length, 'registros');
  
  return filtered;
}

// KPIs agregados do último timestamp
function aggLatest(filtered) {
  if (filtered.length === 0) return {};
  const lastTs = filtered[filtered.length - 1].ts;
  const rows = filtered.filter((r) => r.ts === lastTs);
  const loss = rows.reduce((s, r) => s + (r.packetLoss || 0), 0) / rows.length;
  const jitter = rows.reduce((s, r) => s + (r.jitter || 0), 0) / rows.length;
  const cpuMoteRows = filtered.filter((r) => r.source === 'Mote');
  const cpuMote =
    cpuMoteRows.length > 0
      ? cpuMoteRows.reduce((s, r) => s + (r.cpu || 0), 0) / cpuMoteRows.length
      : 0;
  const energy = filtered.reduce((s, r) => s + (r.energy || 0), 0) / filtered.length;
  const eventRate = filtered.filter(
    (r) => r.event !== 'Normal' && new Date(r.ts) > new Date(Date.now() - 60000)
  ).length;
  return { loss, jitter, cpuMote, energy, eventRate };
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
   FUNÇÕES DE RENDERIZAÇÃO
   ========================== */

// Função auxiliar para pegar cor do tema
function themeColor(key) {
  return getComputedStyle(document.documentElement).getPropertyValue(key).trim();
}

// Renderiza KPIs principais
function renderKPIs() {
  console.log('📊 Renderizando KPIs...');
  const f = applyFilters(window.DATA);
  const a = aggLatest(f);
  document.getElementById('kpiPacketLoss').textContent =
    a.loss === undefined ? '—' : (a.loss * 100).toFixed(2) + '%';
  document.getElementById('kpiJitter').textContent =
    a.jitter === undefined ? '—' : Math.round(a.jitter) + ' ms';
  document.getElementById('kpiCpuMote').textContent =
    a.cpuMote ? Math.round(a.cpuMote) + '%' : '—';
  document.getElementById('kpiEnergy').textContent =
    a.energy ? Math.round(a.energy) + ' mW' : '—';
  document.getElementById('kpiEventRate').textContent =
    a.eventRate !== undefined ? a.eventRate + ' /min' : '—';
}

// Renderiza gráfico de séries temporais (PacketLoss/Jitter)
function renderTimeSeries() {
  console.log('📈 Renderizando série temporal...');
  const f = applyFilters(window.DATA);
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

// Renderiza gráfico de barras dos motes com maior perda
function renderTopChart() {
  console.log('📊 Renderizando top chart...');
  const f = applyFilters(window.DATA);
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
  console.log('📈 Renderizando série do dispositivo:', mote);
  const f = applyFilters(window.DATA).filter((d) => d.mote === mote);
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
  const rows = applyFilters(window.DATA).filter((d) => d.mote === mote);
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

// Renderiza tabela de logs do dispositivo selecionado
function renderDeviceLogs(mote) {
  console.log('📋 Renderizando logs do dispositivo:', mote);
  const rows = applyFilters(window.DATA).filter((d) => d.mote === mote).slice(-100).reverse();
  const tbody = document.querySelector('#deviceLogs tbody');
  tbody.innerHTML = '';
  
  if (rows.length === 0) {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td colspan="4" style="text-align:center;color:' + themeColor('--muted') + '">Sem dados para este dispositivo</td>';
    tbody.appendChild(tr);
    return;
  }
  
  rows.forEach((r) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td style="color:${themeColor('--muted')}">${new Date(r.ts).toLocaleString()}</td><td style="color:${
      r.event === 'Normal'
        ? themeColor('--accent3')
        : r.event.includes('DoS')
        ? themeColor('--danger')
        : themeColor('--accent2')
    }">${r.event}</td><td>${(r.packetLoss * 100).toFixed(2)}%</td><td>${Math.round(r.jitter)} ms</td>`;
    tbody.appendChild(tr);
  });
}

// Renderiza tabela de logs recentes na aba Resumo
function renderLatestLogs() {
  console.log('📋 Renderizando logs recentes...');
  const rows = applyFilters(window.DATA).slice(-100).reverse();
  const tbody = document.querySelector('#latestTable tbody');
  tbody.innerHTML = '';

  if (rows.length === 0) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="8" style="text-align:center;color:${themeColor('--muted')}">Nenhum registro de log encontrado para os filtros atuais.</td>`;
    tbody.appendChild(tr);
    return;
  }

  rows.forEach((r) => {
    const tr = document.createElement('tr');
    const severityColor = r.event.includes('DoS') ? themeColor('--danger') : (r.packetLoss > 0.05 ? themeColor('--accent2') : themeColor('--text'));
    const severityText = r.event.includes('DoS') ? 'Crítica' : (r.packetLoss > 0.05 ? 'Atenção' : 'Normal');

    tr.innerHTML = `
      <td style="color:${themeColor('--muted')}">${new Date(r.ts).toLocaleString()}</td>
      <td>${r.mote}</td>
      <td>${r.protocol}</td>
      <td>${r.event}</td>
      <td>${(r.packetLoss * 100).toFixed(2)}%</td>
      <td>${Math.round(r.jitter)} ms</td>
      <td>${r.rssi} dBm</td>
      <td style="color:${severityColor}">${severityText}</td>
    `;
    tbody.appendChild(tr);
  });
}

// Renderiza timeline de eventos
function renderTimeline() {
  console.log('⏰ Renderizando timeline...');
  const f = applyFilters(window.DATA).filter((d) => d.event !== 'Normal').slice(-200).reverse();
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

// Renderiza gráfico comparativo de janelas
function renderCompare() {
  console.log('📊 Renderizando comparativo...');
  const labels = [];
  const a = [], b = [];
  const now = Date.now();
  for (let i = 23; i >= 0; i--) {
    labels.push(`${i}h`);
    const startA = now - (i + 1) * 3600 * 1000;
    const endA = now - i * 3600 * 1000;
    const startB = now - (i + 25) * 3600 * 1000;
    const endB = now - (i + 24) * 3600 * 1000;
    const valsA = window.DATA.filter((d) => {
      const t = new Date(d.ts).getTime();
      return t >= startA && t < endA;
    }).map((d) => d.packetLoss || 0);
    const valsB = window.DATA.filter((d) => {
      const t = new Date(d.ts).getTime();
      return t >= startB && t < endB;
    }).map((d) => d.packetLoss || 0);
    const avgA = valsA.length ? valsA.reduce((s, v) => s + v, 0) / valsA.length : 0;
    const avgB = valsB.length ? valsB.reduce((s, v) => s + v, 0) / valsB.length : 0;
    a.push(avgA * 100);
    b.push(avgB * 100);
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

// Renderiza topologia interativa com D3.js
function renderSimImage() {
  const container = document.getElementById('simImage');
  if (!container) return;
  
  container.style.width = '100%';
  container.style.height = '100%';
  container.innerHTML = '';
  
  const f = applyFilters(window.DATA);
  const motes = Array.from(new Set(f.map(d => d.mote)));
  
  if (motes.length === 0) {
    container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#73B0BA;font-size:14px;">⏳ Aguardando dados da rede...</div>';
    return;
  }
  
  if (typeof d3 === 'undefined') {
    console.warn('D3.js não disponível, usando SVG estático');
    renderSimImageStatic();
    return;
  }
  
  // Criar wrapper para controles
  const wrapper = document.createElement('div');
  wrapper.style.position = 'relative';
  wrapper.style.width = '100%';
  wrapper.style.height = '100%';
  container.appendChild(wrapper);
  
  // Adicionar botões de controle
  const controls = document.createElement('div');
  controls.className = 'topology-controls';
  controls.innerHTML = `
    <button class="topology-btn" onclick="resetTopologyZoom()">🔄 Reset Zoom</button>
    <button class="topology-btn" onclick="toggleTopologyPhysics()">⚡ Física: ON</button>
  `;
  wrapper.appendChild(controls);
  
  // Container do SVG
  const svgContainer = document.createElement('div');
  svgContainer.style.width = '100%';
  svgContainer.style.height = '100%';
  wrapper.appendChild(svgContainer);
  
  const nodes = [
    { id: 'Gateway', type: 'gateway', fx: 600, fy: 300 },
    ...motes.map(m => ({ id: m, type: 'mote' }))
  ];
  
  const links = motes.map(m => {
    const moteData = f.filter(d => d.mote === m);
    const loss = moteData.length > 0 
      ? moteData.reduce((s, d) => s + d.packetLoss, 0) / moteData.length 
      : 0;
    return { source: 'Gateway', target: m, loss: loss };
  });
  
  const width = 1200, height = 600;
  const svg = d3.select(svgContainer)
    .append('svg')
    .attr('width', '100%')
    .attr('height', '100%')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .style('background', '#141b1c');
  
  const g = svg.append('g');
  
  // Salvar zoom para reset
  const zoom = d3.zoom()
    .scaleExtent([0.3, 5])
    .on('zoom', (event) => {
      g.attr('transform', event.transform);
    });
  
  svg.call(zoom);
  
  // Função global para reset de zoom
  window.resetTopologyZoom = () => {
    svg.transition().duration(750).call(
      zoom.transform,
      d3.zoomIdentity
    );
  };
  
  const simulation = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(links).id(d => d.id).distance(200))
    .force('charge', d3.forceManyBody().strength(-400))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collision', d3.forceCollide().radius(50));
  
  // Toggle física
  window.toggleTopologyPhysics = () => {
    const btn = document.querySelector('.topology-controls button:nth-child(2)');
    if (simulation.alpha() > 0) {
      simulation.stop();
      btn.textContent = '⚡ Física: OFF';
    } else {
      simulation.alpha(1).restart();
      btn.textContent = '⚡ Física: ON';
    }
  };
  
  // Gradiente para links
  const defs = svg.append('defs');
  links.forEach((link, i) => {
    const gradient = defs.append('linearGradient')
      .attr('id', `gradient-${i}`)
      .attr('gradientUnits', 'userSpaceOnUse');
    
    gradient.append('stop')
      .attr('offset', '0%')
      .attr('stop-color', '#5DE3FA');
    
    gradient.append('stop')
      .attr('offset', '100%')
      .attr('stop-color', link.loss > 0.1 ? '#FAA45C' : '#73B0BA');
  });
  
  const link = g.append('g')
    .selectAll('line')
    .data(links)
    .join('line')
    .attr('stroke', (d, i) => `url(#gradient-${i})`)
    .attr('stroke-width', d => d.loss > 0.1 ? 3 : 2)
    .attr('opacity', 0.7);
  
  const node = g.append('g')
    .selectAll('circle')
    .data(nodes)
    .join('circle')
    .attr('r', d => d.type === 'gateway' ? 35 : 20)
    .attr('fill', d => d.type === 'gateway' ? '#5DE3FA' : '#73B0BA')
    .attr('stroke', '#5DE3FA')
    .attr('stroke-width', d => d.type === 'gateway' ? 3 : 2)
    .attr('opacity', 0.9)
    .style('cursor', 'grab')
    .style('filter', 'drop-shadow(0 0 8px rgba(93, 227, 250, 0.5))')
    .call(d3.drag()
      .on('start', dragstarted)
      .on('drag', dragged)
      .on('end', dragended));
  
  const label = g.append('g')
    .selectAll('text')
    .data(nodes)
    .join('text')
    .text(d => d.id)
    .attr('font-size', d => d.type === 'gateway' ? 13 : 11)
    .attr('font-weight', d => d.type === 'gateway' ? 'bold' : 'normal')
    .attr('fill', '#fff')
    .attr('text-anchor', 'middle')
    .attr('dy', d => d.type === 'gateway' ? 5 : 4)
    .style('pointer-events', 'none')
    .style('user-select', 'none')
    .style('text-shadow', '0 0 4px rgba(0,0,0,0.8)');
  
  node.append('title')
    .text(d => {
      if (d.type === 'gateway') return '🌐 Gateway Central\n(arraste para mover)';
      const moteData = f.filter(r => r.mote === d.id);
      if (moteData.length === 0) return d.id;
      const avgLoss = (moteData.reduce((s, r) => s + r.packetLoss, 0) / moteData.length * 100).toFixed(2);
      const avgJitter = Math.round(moteData.reduce((s, r) => s + r.jitter, 0) / moteData.length);
      const avgRssi = Math.round(moteData.reduce((s, r) => s + r.rssi, 0) / moteData.length);
      return `📡 ${d.id}\n━━━━━━━━━━━━━\n📊 Perda: ${avgLoss}%\n⏱️ Jitter: ${avgJitter}ms\n📶 RSSI: ${avgRssi}dBm\n\n💡 Arraste para mover`;
    });
  
  simulation.on('tick', () => {
    link
      .attr('x1', d => d.source.x)
      .attr('y1', d => d.source.y)
      .attr('x2', d => d.target.x)
      .attr('y2', d => d.target.y);
    
    node
      .attr('cx', d => d.x)
      .attr('cy', d => d.y);
    
    label
      .attr('x', d => d.x)
      .attr('y', d => d.y);
  });
  
  function dragstarted(event, d) {
    if (!event.active) simulation.alphaTarget(0.3).restart();
    d.fx = d.x;
    d.fy = d.y;
    d3.select(this).style('cursor', 'grabbing');
  }
  
  function dragged(event, d) {
    d.fx = event.x;
    d.fy = event.y;
  }
  
  function dragended(event, d) {
    if (!event.active) simulation.alphaTarget(0);
    if (d.type !== 'gateway') {
      d.fx = null;
      d.fy = null;
    }
    d3.select(this).style('cursor', 'grab');
  }
  
  // Legendas
  const legend = g.append('g')
    .attr('transform', 'translate(20, 20)');
  
  const legendData = [
    { color: '#5DE3FA', text: '⚡ Gateway' },
    { color: '#73B0BA', text: '📡 Mote OK (<5% perda)' },
    { color: '#FAA45C', text: '⚠️ Mote Degradado (>10% perda)' }
  ];
  
  legendData.forEach((item, i) => {
    const lg = legend.append('g')
      .attr('transform', `translate(0, ${i * 25})`);
    
    lg.append('circle')
      .attr('r', 8)
      .attr('fill', item.color)
      .attr('opacity', 0.9);
    
    lg.append('text')
      .attr('x', 15)
      .attr('y', 4)
      .attr('fill', '#fff')
      .attr('font-size', 11)
      .style('text-shadow', '0 0 4px rgba(0,0,0,0.8)')
      .text(item.text);
  });
}

// Função de fallback para SVG estático
function renderSimImageStatic() {
  const container = document.getElementById('simImage');
  if (!container) return;
  
  const f = applyFilters(window.DATA);
  const motes = Array.from(new Set(f.map(d => d.mote))).slice(0, 8);
  
  let circles = '';
  let lines = '';
  
  motes.forEach((mote, i) => {
    const angle = (i * 2 * Math.PI) / motes.length;
    const x = 600 + 220 * Math.cos(angle);
    const y = 300 + 220 * Math.sin(angle);
    
    const moteData = f.filter(d => d.mote === mote);
    const moteLoss = moteData.length > 0 
      ? moteData.reduce((sum, d) => sum + d.packetLoss, 0) / moteData.length 
      : 0;
    const color = moteLoss > 0.1 ? '#FAA45C' : moteLoss > 0.05 ? '#73B0BA' : '#5DE3FA';
    
    lines += `<line x1="600" y1="300" x2="${x}" y2="${y}" stroke="${color}" stroke-width="2" opacity="0.6"/>`;
    circles += `<circle cx="${x}" cy="${y}" r="28" fill="${color}" opacity="0.8"/>`;
    circles += `<text x="${x}" y="${y+5}" fill="#141b1c" font-size="11" font-weight="600" text-anchor="middle">${mote}</text>`;
  });
  
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='100%' height='100%' viewBox='0 0 1200 600'>
    <rect width='100%' height='100%' fill='#141b1c'/>
    ${lines}
    <circle cx='600' cy='300' r='45' fill='#5DE3FA' opacity='0.95'/>
    <text x='600' y='305' fill='#141b1c' font-size='12' font-weight='bold' text-anchor='middle'>GATEWAY</text>
    ${circles}
  </svg>`;
  
  container.innerHTML = svg;
}

/* ==========================
   RENDERIZAÇÃO INTELIGENTE
   ========================== */

// Renderiza aba ativa com base na navegação
function renderActiveTab() {
  const activeTab = document.querySelector('.tab.active')?.dataset.tab;
  if (!activeTab) return;
  
  console.log('🎯 Renderizando aba:', activeTab);
  
  switch (activeTab) {
    case 'resumo':
      renderKPIs();
      renderTimeSeries();
      renderTopChart();
      renderLatestLogs();
      renderSimImage();
      break;
    case 'dispositivos':
      if (selMoteDet.options.length > 0) {
        const mote = selMoteDet.value || selMoteDet.options[0].value;
        renderDeviceSeries(mote);
        renderDeviceKpis(mote);
        renderDeviceLogs(mote);
      }
      break;
    case 'eventos':
      renderTimeline();
      break;
    case 'tendencias':
      renderCompare();
      break;
    case 'config':
      // Aba estática
      break;
  }
}

// Atualiza todos os dados e filtros
function renderAll() {
  console.log('🔄 Iniciando renderAll()...');
  populateFiltersFromData();
  renderSimImage();
  renderActiveTab();
}

/* ==========================
   ASSINATURA DO FIREBASE
   ========================== */

// Função para assinar dados do Realtime Database e popular window.DATA
function subscribeFirebase(path = 'logs') {
  console.log('🔥 Conectando ao Firebase no caminho:', path);
  
  try {
    const dbRef = ref(db, path);
    onValue(
      dbRef,
      (snapshot) => {
        console.log('📥 Dados recebidos do Firebase');
        const val = snapshot.val();
        
        if (!val) {
          console.warn('⚠️ Firebase: nó vazio em', path);
          console.log('💡 Dica: Verifique se há dados no caminho "' + path + '" no Firebase Realtime Database');
          return;
        }
        
        console.log('📦 Tipo de dados recebidos:', typeof val);
        console.log('📦 Dados brutos:', val);
        
        // Converte os dados para array
        if (Array.isArray(val)) {
          window.DATA = val;
        } else if (typeof val === 'object') {
          if (Array.isArray(val.logs)) {
            window.DATA = val.logs;
          } else {
            window.DATA = Object.values(val);
          }
        } else {
          console.warn('⚠️ Firebase: formato de dados inesperado em', path);
          return;
        }
        
        console.log('📊 Total de registros antes da normalização:', window.DATA.length);
        
        // Normaliza os dados
        window.DATA = window.DATA.map((r, index) => {
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

          const mote = r.mote ?? (r.node_id ? 'MOTE' + r.node_id : r.node ?? 'MOTE' + index);
          const protocol = r.protocol ?? r.protocolo ?? 'Unknown';
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
            temperature,
            energy,
            source,
          };
        });
        
        console.log('✅ Dados normalizados:', window.DATA.length, 'registros');
        console.log('📄 Exemplo de registro normalizado:', window.DATA[0]);
        
        // Popula filtros e renderiza
        populateFiltersFromData();
        renderAll();
      },
      (err) => {
        console.error('❌ Erro ao ler Firebase:', err);
        console.log('💡 Verifique:');
        console.log('   1. Configuração do Firebase em firebase-config.js');
        console.log('   2. Regras de segurança do Realtime Database');
        console.log('   3. Caminho dos dados (atual: "' + path + '")');
      }
    );
  } catch (err) {
    console.error('❌ Erro ao assinar Firebase:', err);
  }
}

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
    renderActiveTab();
  });
});

/* ==========================
   LISTENERS DE EVENTOS
   ========================== */

// Atualiza dados ao clicar em Atualizar
refreshBtn.addEventListener('click', () => {
  console.log('🔄 Botão atualizar clicado');
  renderAll();
});

// Aplica filtros e atualiza gráficos ao mudar seleção
const debouncedRender = debounce(renderAll, 300);
[fMote, fProt, fSource, timeRange].forEach((el) =>
  el.addEventListener('change', () => {
    console.log('🔍 Filtro alterado');
    debouncedRender();
  })
);

// Renderiza série e KPIs do dispositivo selecionado
selMoteDet.addEventListener('change', () => {
  console.log('📱 Dispositivo selecionado:', selMoteDet.value);
  renderDeviceSeries(selMoteDet.value);
  renderDeviceKpis(selMoteDet.value);
  renderDeviceLogs(selMoteDet.value);
});

// Listener para reconhecimento de alertas
document.getElementById('ackAll').addEventListener('click', () => {
  console.log('✅ Alertas reconhecidos');
  alert('Todos os alertas foram reconhecidos');
});

/* ==========================
   INICIALIZAÇÃO
   ========================== */

console.log('🚀 Inicializando Dashboard IIoT...');

// Inicia assinatura do Firebase
// IMPORTANTE: Altere o path se seus dados estiverem em outro nó
// Exemplos: '/', 'data', 'readings', 'metrics', etc.
try {
  subscribeFirebase('logs');
} catch (err) {
  console.error('❌ Erro ao inicializar Firebase:', err);
}

// Renderiza interface inicial (mesmo sem dados)
renderSimImage();

console.log('✅ Dashboard IIoT carregado');
console.log('📊 Aguardando dados do Firebase...');