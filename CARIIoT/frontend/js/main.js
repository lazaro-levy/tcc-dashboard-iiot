/* ======================
   CONFIGURAÇÃO E DADOS
   ====================== */

// Variável global para armazenar os dados do frigorífico
window.DATA = {
  fisico: { bomba: 'OFF', nivel: 0, temperatura: 0 },
  virtual: {
    monitoramento: {
      ataque: { duracao: 0 },
      sistema: { cpu: 0, memoria: 0 },
      status: 'NORMAL',
      timestamp: Date.now(),
      trafego: { msgs_invalidas: 0, pacotes_rede: 0, taxa_msgs: 0 }
    },
    operacional: { bomba: 'OFF', nivel: 0, temperatura: 0 }
  },
  historico: []
};

/* ======================
   FIREBASE
   ====================== */

import { db } from './firebase-config.js';
import { ref, onValue } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js';

/* =========================
   REFERÊNCIAS DO DOM
   ========================= */

const tabs = document.querySelectorAll('.tab');
const pages = {
  'visao-geral': document.getElementById('page-visao-geral'),
  'tendencias': document.getElementById('page-tendencias')
};
const sidebar = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebarToggle');
// const refreshBtn = document.getElementById('refreshBtn'); // Removido: Botão Atualizar não é mais necessário

/* ==========================
   SIDEBAR RETRÁTIL
   ========================== */

sidebarToggle.addEventListener('click', () => {
  sidebar.classList.toggle('expanded');

  // Força reflow e resize dos canvases após transição
  setTimeout(() => {
    // Se usa Chart.js, chame resize nos gráficos existentes
    if (tempChart) tempChart.resize();
    if (resourceChart) resourceChart.resize();
    if (msgRateChart) msgRateChart.resize();
    if (eventAnalysisChart) eventAnalysisChart.resize();
  }, 320); // um pouco maior que a transição de 300ms
});

/* ==========================
   INSTÂNCIAS DE GRÁFICOS
   ========================== */
let tempChart = null;
let resourceChart = null;
let msgRateChart = null;
let eventAnalysisChart = null;
let generalChart = null;

/* ==========================
   FUNÇÃO AUXILIAR PARA CORES
   ========================== */

function themeColor(key) {
  return getComputedStyle(document.documentElement).getPropertyValue(key).trim();
}

/* ==========================
   FUNÇÕES DE RENDERIZAÇÃO - KPIs
   ========================== */

function renderKPIs() {
  console.log('📊 Renderizando KPIs...');
  
  const { fisico, virtual } = window.DATA;
  const { monitoramento, operacional } = virtual;
  
  // Temperatura
  const tempElement = document.querySelector('#kpiTemperatura span:first-child');
  const tempIndicator = document.querySelector('#kpiTemperatura .status-indicator');
  tempElement.textContent = operacional.temperatura.toFixed(1);
  
  if (operacional.temperatura < 34) {
    tempIndicator.className = 'status-indicator status-ok';
  } else if (operacional.temperatura < 70) {
    tempIndicator.className = 'status-indicator status-warning';
  } else {
    tempIndicator.className = 'status-indicator status-critical';
  }
  
  // Nível
  const nivelElement = document.querySelector('#kpiNivel span:first-child');
  const nivelIndicator = document.querySelector('#kpiNivel .status-indicator');
  nivelElement.textContent = (operacional.nivel * 100).toFixed(0);
  
  if (operacional.nivel > 0.7) {
    nivelIndicator.className = 'status-indicator status-ok';
  } else if (operacional.nivel > 0.3) {
    nivelIndicator.className = 'status-indicator status-warning';
  } else {
    nivelIndicator.className = 'status-indicator status-critical';
  }
  
  // Bomba
  const bombaElement = document.querySelector('#kpiBomba span:first-child');
  const bombaIndicator = document.querySelector('#kpiBomba .status-indicator');
  bombaElement.textContent = operacional.bomba;
  bombaIndicator.className = operacional.bomba === 'ON' 
    ? 'status-indicator status-ok' 
    : 'status-indicator status-warning';
  
  // CPU
  const cpuElement = document.querySelector('#kpiCpu span:first-child');
  const cpuIndicator = document.querySelector('#kpiCpu .status-indicator');
  cpuElement.textContent = monitoramento.sistema.cpu.toFixed(1);
  
  if (monitoramento.sistema.cpu < 50) {
    cpuIndicator.className = 'status-indicator status-ok';
  } else if (monitoramento.sistema.cpu < 80) {
    cpuIndicator.className = 'status-indicator status-warning';
  } else {
    cpuIndicator.className = 'status-indicator status-critical';
  }
  
  // Memória
  const memElement = document.querySelector('#kpiMemoria span:first-child');
  const memIndicator = document.querySelector('#kpiMemoria .status-indicator');
  memElement.textContent = monitoramento.sistema.memoria.toFixed(1);
  
  if (monitoramento.sistema.memoria < 60) {
    memIndicator.className = 'status-indicator status-ok';
  } else if (monitoramento.sistema.memoria < 85) {
    memIndicator.className = 'status-indicator status-warning';
  } else {
    memIndicator.className = 'status-indicator status-critical';
  }
  
  // Status
  const statusElement = document.querySelector('#kpiStatus span:first-child');
  const statusIndicator = document.querySelector('#kpiStatus .status-indicator');
  statusElement.textContent = monitoramento.status;
  
  if (monitoramento.status === 'NORMAL') {
    statusIndicator.className = 'status-indicator status-ok';
  } else if (monitoramento.status.includes('ALERTA')) {
    statusIndicator.className = 'status-indicator status-warning';
  } else {
    statusIndicator.className = 'status-indicator status-critical';
  }
}

/* ==========================
   GRÁFICO DE TEMPERATURA
   ========================== */

function renderTempChart() {
  console.log('🌡️ Renderizando gráfico de temperatura...');
  
  const hist = window.DATA.historico.slice(-60);
  const labels = hist.map(h => new Date(h.timestamp).toLocaleTimeString());
  const temps = hist.map(h => h.temperatura);
  
  const ctx = document.getElementById('tempChart').getContext('2d');
  
  if (tempChart) {
    tempChart.data.labels = labels;
    tempChart.data.datasets[0].data = temps;
    tempChart.update();
  } else {
    tempChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Temperatura (°C)',
          data: temps,
          borderColor: themeColor('--accent2'),
          backgroundColor: 'rgba(250,164,92,0.1)',
          tension: 0.4,
          fill: true
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: true, labels: { color: themeColor('--text') } }
        },
        scales: {
          y: { 
            ticks: { color: themeColor('--muted') },
            grid: { color: themeColor('--glass') }
          },
          x: { 
            ticks: { color: themeColor('--muted') },
            grid: { color: themeColor('--glass') }
          }
        }
      }
    });
  }
}

/* ==========================
   GRÁFICO DE RECURSOS
   ========================== */

function renderResourceChart() {
  console.log('💻 Renderizando gráfico de recursos...');
  
  const hist = window.DATA.historico.slice(-60);
  const labels = hist.map(h => new Date(h.timestamp).toLocaleTimeString());
  const cpu = hist.map(h => h.cpu);
  const memoria = hist.map(h => h.memoria);
  
  const ctx = document.getElementById('resourceChart').getContext('2d');
  
  if (resourceChart) {
    resourceChart.data.labels = labels;
    resourceChart.data.datasets[0].data = cpu;
    resourceChart.data.datasets[1].data = memoria;
    resourceChart.update();
  } else {
    resourceChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'CPU (%)',
            data: cpu,
            borderColor: themeColor('--accent'),
            backgroundColor: 'rgba(93,227,250,0.1)',
            tension: 0.4
          },
          {
            label: 'Memória (%)',
            data: memoria,
            borderColor: themeColor('--accent4'),
            backgroundColor: 'rgba(115,176,186,0.1)',
            tension: 0.4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: true, labels: { color: themeColor('--text') } }
        },
        scales: {
          y: { 
            ticks: { color: themeColor('--muted') },
            grid: { color: themeColor('--glass') },
            max: 100
          },
          x: { 
            ticks: { color: themeColor('--muted') },
            grid: { color: themeColor('--glass') }
          }
        }
      }
    });
  }
}

/* ==========================
   GRÁFICO GERAL DO SISTEMA
   ========================== */

function renderGeneralChart() {
  console.log('📊 Renderizando gráfico geral...');
  
  const hist = window.DATA.historico.slice(-60);
  const labels = hist.map(h => new Date(h.timestamp).toLocaleTimeString());
  
  const ctx = document.getElementById('generalChart').getContext('2d');
  
  if (generalChart) {
    generalChart.data.labels = labels;
    generalChart.data.datasets[0].data = hist.map(h => h.temperatura);
    generalChart.data.datasets[1].data = hist.map(h => h.cpu);
    generalChart.data.datasets[2].data = hist.map(h => h.memoria);
    generalChart.data.datasets[3].data = hist.map(h => h.nivel * 100);
    generalChart.update();
  } else {
    generalChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Temperatura (°C)',
            data: hist.map(h => h.temperatura),
            borderColor: themeColor('--accent2'),
            backgroundColor: 'rgba(250,164,92,0.1)',
            tension: 0.4,
            yAxisID: 'y'
          },
          {
            label: 'CPU (%)',
            data: hist.map(h => h.cpu),
            borderColor: themeColor('--accent'),
            backgroundColor: 'rgba(93,227,250,0.1)',
            tension: 0.4,
            yAxisID: 'y1'
          },
          {
            label: 'Memória (%)',
            data: hist.map(h => h.memoria),
            borderColor: themeColor('--accent4'),
            backgroundColor: 'rgba(115,176,186,0.1)',
            tension: 0.4,
            yAxisID: 'y1'
          },
          {
            label: 'Nível (%)',
            data: hist.map(h => h.nivel * 100),
            borderColor: '#a58a74',
            backgroundColor: 'rgba(34,197,94,0.1)',
            tension: 0.4,
            yAxisID: 'y1'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false
        },
        plugins: {
          legend: { 
            display: true, 
            labels: { color: themeColor('--text') }
          }
        },
        scales: {
          y: {
            type: 'linear',
            display: true,
            position: 'left',
            title: {
              display: true,
              text: 'Temperatura (°C)',
              color: themeColor('--accent2')
            },
            ticks: { color: themeColor('--muted') },
            grid: { color: themeColor('--glass') }
          },
          y1: {
            type: 'linear',
            display: true,
            position: 'right',
            title: {
              display: true,
              text: 'Percentual (%)',
              color: themeColor('--accent')
            },
            ticks: { color: themeColor('--muted') },
            grid: { drawOnChartArea: false },
            max: 100
          },
          x: {
            ticks: { color: themeColor('--muted') },
            grid: { color: themeColor('--glass') }
          }
        }
      }
    });
  }
}

/* ==========================
   TABELA DE LOGS
   ========================== */

function renderLatestLogs() {
  console.log('📋 Renderizando logs...');
  
  const tbody = document.querySelector('#latestTable tbody');
  tbody.innerHTML = '';
  
  const logs = window.DATA.historico.slice(-50).reverse();
  
  if (logs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:' + themeColor('--muted') + '">Aguardando dados...</td></tr>';
    return;
  }
  
  logs.forEach(log => {
    const tr = document.createElement('tr');
    const statusColor = log.status === 'NORMAL' ? themeColor('--accent3') : themeColor('--danger');
    
    tr.innerHTML = `
      <td style="color:${themeColor('--muted')}">${new Date(log.timestamp).toLocaleString()}</td>
      <td style="color:${statusColor}">${log.status}</td>
      <td>${log.temperatura.toFixed(1)}°C</td>
      <td>${(log.nivel * 100).toFixed(0)}%</td>
      <td>${log.bomba}</td>
      <td>${log.cpu.toFixed(1)}%</td>
      <td>${log.memoria.toFixed(1)}%</td>
    `;
    tbody.appendChild(tr);
  });
}

/* ==========================
   TOPOLOGIA DO SISTEMA
   ========================== */

function renderSimImage() {
  const container = document.getElementById('simImage');
  if (!container) return;
  
  const { fisico, virtual } = window.DATA;
  const { monitoramento } = virtual;
  
  // Cores baseadas no status
  const tempColor = fisico.temperatura < 5 ? '#5DE3FA' : fisico.temperatura < 10 ? '#FAA45C' : '#ff6b6b';
  const cpuColor = monitoramento.sistema.cpu < 50 ? '#5DE3FA' : monitoramento.sistema.cpu < 80 ? '#FAA45C' : '#ff6b6b';
  const statusColor = monitoramento.status === 'NORMAL' ? '#5DE3FA' : '#FAA45C';
  
  const svg = `
    <svg xmlns='http://www.w3.org/2000/svg' width='100%' height='100%' viewBox='0 0 800 400'>
      <defs>
        <filter id="glow">
          <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
          <feMerge>
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>
      
      <rect width='100%' height='100%' fill='#141b1c'/>
      
      <!-- Sistema Físico -->
      <g transform="translate(150, 200)">
        <circle cx="0" cy="0" r="60" fill="${tempColor}" opacity="0.2" filter="url(#glow)"/>
        <circle cx="0" cy="0" r="50" fill="${tempColor}" opacity="0.9"/>
        <text x="0" y="-10" fill="#141b1c" font-size="14" font-weight="bold" text-anchor="middle">FÍSICO</text>
        <text x="0" y="10" fill="#141b1c" font-size="12" text-anchor="middle">Temp: ${fisico.temperatura.toFixed(1)}°C</text>
        <text x="0" y="25" fill="#141b1c" font-size="11" text-anchor="middle">Nível: ${(fisico.nivel * 100).toFixed(0)}%</text>
      </g>
      
      <!-- Sistema Virtual -->
      <g transform="translate(650, 200)">
        <circle cx="0" cy="0" r="60" fill="${cpuColor}" opacity="0.2" filter="url(#glow)"/>
        <circle cx="0" cy="0" r="50" fill="${cpuColor}" opacity="0.9"/>
        <text x="0" y="-10" fill="#141b1c" font-size="14" font-weight="bold" text-anchor="middle">VIRTUAL</text>
        <text x="0" y="10" fill="#141b1c" font-size="12" text-anchor="middle">CPU: ${monitoramento.sistema.cpu.toFixed(1)}%</text>
        <text x="0" y="25" fill="#141b1c" font-size="11" text-anchor="middle">MEM: ${monitoramento.sistema.memoria.toFixed(1)}%</text>
      </g>
      
      <!-- Conexão -->
      <line x1="210" y1="200" x2="590" y2="200" stroke="${statusColor}" stroke-width="3" opacity="0.6" stroke-dasharray="5,5">
        <animate attributeName="stroke-dashoffset" from="0" to="10" dur="1s" repeatCount="indefinite"/>
      </line>
      
      <!-- Monitor Central -->
      <g transform="translate(400, 200)">
        <rect x="-40" y="-30" width="80" height="60" rx="8" fill="${statusColor}" opacity="0.9"/>
        <text x="0" y="-5" fill="#141b1c" font-size="11" font-weight="bold" text-anchor="middle">MONITOR</text>
        <text x="0" y="15" fill="#141b1c" font-size="10" text-anchor="middle">${monitoramento.status}</text>
      </g>
      
      <!-- Bomba -->
      <g transform="translate(150, 80)">
        <circle cx="0" cy="0" r="25" fill="${fisico.bomba === 'ON' ? '#5DE3FA' : '#696B7A'}" opacity="0.9"/>
        <text x="0" y="5" fill="#141b1c" font-size="10" font-weight="bold" text-anchor="middle">BOMBA</text>
        <text x="0" y="-40" fill="#73B0BA" font-size="9" text-anchor="middle">${fisico.bomba}</text>
      </g>
      
      <!-- Legendas -->
      <g transform="translate(20, 20)">
        <text fill="${themeColor('--accent')}" font-size="25" font-weight="bold">Sistema Frigorífico</text>
        <text y="20" fill="${themeColor('--muted')}" font-size="9">Monitoramento em Tempo Real</text>
      </g>
    </svg>
  `;
  
  container.innerHTML = svg;
}

/* ==========================
   GRÁFICOS DE TENDÊNCIAS
   ========================== */

function renderMsgRateChart() {
  const hist = window.DATA.historico.slice(-60);
  const labels = hist.map(h => new Date(h.timestamp).toLocaleTimeString());
  const rates = hist.map(h => h.taxa_msgs || 0);
  
  const ctx = document.getElementById('msgRateChart').getContext('2d');
  
  if (msgRateChart) {
    msgRateChart.data.labels = labels;
    msgRateChart.data.datasets[0].data = rates;
    msgRateChart.update();
  } else {
    msgRateChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Taxa de Mensagens (msgs/s)',
          data: rates,
          backgroundColor: themeColor('--accent'),
          borderColor: themeColor('--accent'),
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: themeColor('--text') } } },
        scales: {
          y: { ticks: { color: themeColor('--muted') }, grid: { color: themeColor('--glass') } },
          x: { ticks: { color: themeColor('--muted') }, grid: { color: themeColor('--glass') } }
        }
      }
    });
  }
}

function renderEventAnalysisChart() {
  const hist = window.DATA.historico;
  const statusCounts = {};
  
  hist.forEach(h => {
    statusCounts[h.status] = (statusCounts[h.status] || 0) + 1;
  });
  
  const labels = Object.keys(statusCounts);
  const data = Object.values(statusCounts);
  
  const ctx = document.getElementById('eventAnalysisChart').getContext('2d');
  
  if (eventAnalysisChart) {
    eventAnalysisChart.data.labels = labels;
    eventAnalysisChart.data.datasets[0].data = data;
    eventAnalysisChart.update();
  } else {
    eventAnalysisChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: data,
          backgroundColor: [
            themeColor('--accent3'),
            themeColor('--accent2'),
            themeColor('--danger')
          ]
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: themeColor('--text') } } }
      }
    });
  }
}

/* ==========================
   CONTROLE DE ATAQUES - VERSÃO NGROK
   ========================== */

// ✅ URL DO SEU NGROK - ATUALIZE COM A SUA!
const API_BASE_URL = 'https://septariate-woodrow-fixatedly.ngrok-free.dev';

// Estado dos ataques
const attackState = {
  flood: false,
  dos: false
};

// Referências dos botões
const attackFloodBtn = document.getElementById('attackFlood');
const attackDosBtn = document.getElementById('attackDos');
const mitigateFloodBtn = document.getElementById('mitigateFlood');
const mitigateDosBtn = document.getElementById('mitigateDos');

// Função para executar script no Fedora
async function executeScript(endpoint, body = null) {
  try {
    console.log(`📡 Enviando requisição para: ${API_BASE_URL}${endpoint}`, body);
    
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: { 
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: body ? JSON.stringify(body) : null
    });

    console.log(`📊 Resposta recebida:`, response.status, response.statusText);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Erro ${response.status}: ${response.statusText}\n${errorText}`);
    }

    const data = await response.json();
    console.log(`✅ Resposta JSON:`, data);
    return data;

  } catch (err) {
    console.error('❌ Erro na requisição:', err);
    alert("Erro: " + err.message);
    throw err;
  }
}

// Handler do botão Flood Attack
attackFloodBtn.addEventListener('click', async () => {
  try {
    attackFloodBtn.disabled = true;
    // attackFloodBtn.textContent = attackState.flood ? 'Parando...' : 'Iniciando...';
    
    if (attackState.flood) {
      const result = await executeScript("/executar", { acao: "flood", tipo: "stop" });
      attackState.flood = false;
      attackFloodBtn.classList.remove('active');
      // attackFloodBtn.textContent = 'Flood';
      console.log("✅ Ataque Flood parado", result);
      alert("✅ Ataque Flood parado");
    } else {
      const result = await executeScript("/executar", { acao: "flood", tipo: "start" });
      attackState.flood = true;
      attackFloodBtn.classList.add('active');
      // attackFloodBtn.textContent = 'Flood';
      console.log("⚠️ Ataque Flood iniciado", result);
      alert("⚠️ Ataque Flood iniciado");
    }
  } catch (error) {
    console.error("Erro no botão Flood:", error);
  } finally {
    attackFloodBtn.disabled = false;
  }
});

// Handler do botão DoS Attack
attackDosBtn.addEventListener('click', async () => {
  try {
    attackDosBtn.disabled = true;
    // attackDosBtn.textContent = attackState.dos ? 'Parando...' : 'Iniciando...';
    
    if (attackState.dos) {
      const result = await executeScript("/executar", { acao: "dos", tipo: "stop" });
      attackState.dos = false;
      attackDosBtn.classList.remove('active');
      // attackDosBtn.textContent = 'DoS';
      console.log("✅ Ataque DoS parado", result);
      alert("✅ Ataque DoS parado");
    } else {
      const result = await executeScript("/executar", { acao: "dos", tipo: "start" });
      attackState.dos = true;
      attackDosBtn.classList.add('active');
      // attackDosBtn.textContent = 'DoS';
      console.log("⚠️ Ataque DoS iniciado", result);
      alert("⚠️ Ataque DoS iniciado");
    }
  } catch (error) {
    console.error("Erro no botão DoS:", error);
  } finally {
    attackDosBtn.disabled = false;
  }
});

// Handler do botão Mitigate Flood
mitigateFloodBtn.addEventListener("click", async () => {
  try {
    mitigateFloodBtn.disabled = true;
    // mitigateFloodBtn.textContent = 'Ativando...';
    
    const result = await executeScript("/executar", { acao: "mitigacao_flood", tipo: "start" });
    console.log("Mitigação Flood:", result);

    if (attackState.flood) {
      await executeScript("/executar", { acao: "flood", tipo: "stop" });
      attackState.flood = false;
      attackFloodBtn.classList.remove("active");
      // attackFloodBtn.textContent = 'Flood';
    }

    alert("🛡️ Mitigação Flood ativada com sucesso!\nO cenário será resetado em 10 segundos.");
  } catch (error) {
    console.error("Erro na mitigação Flood:", error);
    alert("❌ Erro na mitigação Flood: " + error.message);
  } finally {
    mitigateFloodBtn.disabled = false;
    // mitigateFloodBtn.textContent = 'Flood';
  }
});

// Handler do botão Mitigate DoS
mitigateDosBtn.addEventListener("click", async () => {
  try {
    mitigateDosBtn.disabled = true;
    // mitigateDosBtn.textContent = 'Ativando...';
    
    const result = await executeScript("/executar", { acao: "mitigacao_dos", tipo: "start" });
    console.log("Mitigação DoS:", result);

    if (attackState.dos) {
      await executeScript("/executar", { acao: "dos", tipo: "stop" });
      attackState.dos = false;
      attackDosBtn.classList.remove("active");
      // attackDosBtn.textContent = 'DoS';
    }

    alert("🛡️ Mitigação DoS ativada com sucesso!\nO cenário será resetado em 10 segundos.");
  } catch (error) {
    console.error("Erro na mitigação DoS:", error);
    alert("❌ Erro na mitigação DoS: " + error.message);
  } finally {
    mitigateDosBtn.disabled = false;
    // mitigateDosBtn.textContent = 'Mitigar DoS';
  }
});

// Função para testar conexão
async function testConnection() {
  try {
    console.log(`🔗 Testando conexão com: ${API_BASE_URL}/ping`);
    const response = await fetch(`${API_BASE_URL}/ping`, {
      method: 'GET',
      headers: { "Accept": "application/json" }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log("✅ Conexão com backend OK:", data);
    
    // Mostra a URL em uso
    showConnectionStatus(true, data.url || API_BASE_URL);
    return true;
    
  } catch (error) {
    console.error("❌ Falha na conexão com backend:", error);
    showConnectionStatus(false, API_BASE_URL);
    return false;
  }
}

// Função para mostrar status da conexão
function showConnectionStatus(connected, url) {
  let statusElement = document.getElementById('connection-status');
  
  if (!statusElement) {
    statusElement = document.createElement('div');
    statusElement.id = 'connection-status';
    statusElement.style.cssText = `
      position: fixed;
      bottom: 10px;
      right: 10px;
      padding: 10px 15px;
      border-radius: 5px;
      font-size: 12px;
      z-index: 1000;
      font-family: monospace;
      box-shadow: 0 2px 10px rgba(0,0,0,0.2);
    `;
    document.body.appendChild(statusElement);
  }
  
}

// Função para verificar status dos processos
async function checkProcessStatus() {
  try {
    const response = await fetch(`${API_BASE_URL}/status`);
    const data = await response.json();
    
    // Atualiza estado dos botões baseado nos processos ativos
    data.processos.forEach(processo => {
      if (processo.nome === 'ataque_flood' && processo.ativo) {
        attackState.flood = true;
        attackFloodBtn.classList.add('active');
        // attackFloodBtn.textContent = 'Parar Flood Attack';
      }
      if (processo.nome === 'ataque_dos' && processo.ativo) {
        attackState.dos = true;
        attackDosBtn.classList.add('active');
        // attackDosBtn.textContent = 'Parar DoS Attack';
      }
    });
    
    console.log("🔄 Status atualizado:", data);
    
  } catch (error) {
    console.error("Erro ao verificar status:", error);
  }
}

// Testa a conexão quando a página carrega
window.addEventListener('load', async () => {
  console.log(`🌐 Dashboard iniciado`);
  console.log(`📡 URL da API: ${API_BASE_URL}`);
  
  // Mostra URL em uso no console
  console.log(`ℹ️  Para testar manualmente:`);
  console.log(`   curl ${API_BASE_URL}/ping`);
  console.log(`   curl -X POST ${API_BASE_URL}/executar -H "Content-Type: application/json" -d '{"acao":"flood","tipo":"start"}'`);
  
  // Testa conexão
  const connected = await testConnection();
  
  if (connected) {
    console.log("✅ Dashboard pronto para uso!");
    
    // Verifica status inicial dos processos
    await checkProcessStatus();
    
    // Atualiza status periodicamente (a cada 30 segundos)
    setInterval(checkProcessStatus, 30000);
  } else {
    console.error("❌ Dashboard não conseguiu conectar ao backend");
    alert(`❌ Não foi possível conectar ao backend!\n\nURL: ${API_BASE_URL}\n\nCertifique-se que:\n1. O backend está rodando (python3 backendtestefinal.py)\n2. Ngrok está ativo (ngrok http 5001)\n3. A URL está correta: ${API_BASE_URL}`);
  }
});

// Teste rápido via console
window.testBackend = async function() {
  console.log("🧪 Testando backend...");
  await testConnection();
};

/* ==========================
   RENDERIZAÇÃO POR ABA
   ========================== */

function renderActiveTab() {
  const activeTab = document.querySelector('.tab.active')?.dataset.tab;
  console.log('🎯 Renderizando aba:', activeTab);
  
  switch (activeTab) {
    case 'visao-geral':
      renderKPIs();
      renderTempChart();
      renderResourceChart();
      renderLatestLogs();
      renderSimImage();
      break;
    case 'tendencias':
      renderGeneralChart();
      renderMsgRateChart();
      renderEventAnalysisChart();
      renderStats();
      break;
  }
}

function renderAll() {
  console.log('🔄 Renderizando tudo...');
  renderActiveTab();
}

/* ==========================
   FIREBASE - ASSINATURA
   ========================== */

function subscribeFirebase() {
  console.log('🔥 Conectando ao Firebase...');
  
  const dbRef = ref(db, 'frigorifico');
  onValue(
    dbRef,
    (snapshot) => {
      const val = snapshot.val();
      
      if (!val) {
        console.warn('⚠️ Firebase: dados vazios');
        return;
      }
      
      console.log('📦 Dados recebidos:', val);
      
      // Atualiza dados principais
      window.DATA.fisico = val.fisico || window.DATA.fisico;
      window.DATA.virtual = val.virtual || window.DATA.virtual;
      
      // Adiciona ao histórico
      const entrada = {
        timestamp: val.virtual?.monitoramento?.timestamp || Date.now(),
        temperatura: val.virtual?.operacional?.temperatura || 0,
        nivel: val.fisico?.nivel || 0,
        bomba: val.fisico?.bomba || 'OFF',
        cpu: val.virtual?.monitoramento?.sistema?.cpu || 0,
        memoria: val.virtual?.monitoramento?.sistema?.memoria || 0,
        status: val.virtual?.monitoramento?.status || 'NORMAL',
        taxa_msgs: val.virtual?.monitoramento?.trafego?.taxa_msgs || 0,
        msgs_invalidas: val.virtual?.monitoramento?.trafego?.msgs_invalidas || 0
      };
      
      window.DATA.historico.push(entrada);
      
      // Limita histórico a 1000 entradas
      if (window.DATA.historico.length > 1000) {
        window.DATA.historico = window.DATA.historico.slice(-1000);
      }
      
      console.log('✅ Histórico atualizado:', window.DATA.historico.length, 'entradas');
      
      renderAll();
    },
    (err) => {
      console.error('❌ Erro Firebase:', err);
    }
  );
}

/* ==========================
   NAVEGAÇÃO ENTRE ABAS
   ========================== */

tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    const key = tab.dataset.tab;
    tabs.forEach((t) => {
      t.classList.remove('active');
      t.setAttribute('aria-selected', 'false');
    });
    tab.classList.add('active');
    tab.setAttribute('aria-selected', 'true');
    
    Object.keys(pages).forEach((k) => {
      pages[k].style.display = k === key ? 'grid' : 'none';
    });
    
    renderActiveTab();
  });
});

/* ==========================
   LISTENERS DE EVENTOS
   ========================== */

// Listener do botão 'Atualizar' removido. O carregamento de dados é feito automaticamente pelo Firebase.

/* ==========================
   INICIALIZAÇÃO
   ========================== */

console.log('🚀 Inicializando Dashboard Frigorífico...');

try {
  subscribeFirebase();
} catch (err) {
  console.error('❌ Erro ao inicializar:', err);
}

renderSimImage();
console.log('✅ Dashboard carregado');

// Adicione no final do main.js, temporariamente
const logo = document.getElementById('sidebarLogo');
logo.addEventListener('error', () => {
  console.error('❌ Logo não encontrada em: img/logo.png');
  console.log('📁 Verifique se o arquivo existe neste caminho');
});
logo.addEventListener('load', () => {
  console.log('✅ Logo carregada com sucesso!');
});

// Inicializa os ícones Lucide
lucide.createIcons();
