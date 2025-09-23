// --- Global State Variables ---
let cpuChart, ramChart, mountPieChart, diskIOChart, netIOChart;
let mountsData = [];
let selectedMountIndex = 0;

// --- Utility Functions ---
function logout() {
  localStorage.removeItem('oracleSid');
  localStorage.removeItem('oracleUser');
  window.location.href = "/logout";
}

function showSection(contentSectionId) {
  const sections = ['monitor-section', 'live-report-section', 'reports-section'];
  const navMap = {
    'monitor-section': 'nav-monitor',
    'live-report-section': 'nav-live-report',
    'reports-section': 'nav-reports'
  };

  sections.forEach(id => {
    const section = document.getElementById(id);
    const navItemId = navMap[id];
    const navItem = document.getElementById(navItemId);

    if (id === contentSectionId) {
      section.style.display = 'block';
      setTimeout(() => {
        section.classList.add('active-section');
      }, 10);
      if (navItem) navItem.classList.add('active');
    } else {
      if (navItem) navItem.classList.remove('active');
      section.classList.remove('active-section');
      section.addEventListener('transitionend', function handler() {
        if (!section.classList.contains('active-section')) {
          section.style.display = 'none';
        }
        section.removeEventListener('transitionend', handler);
      }, { once: true });
    }
  });
}

// Simple Toast Notification System
function showToast(message, type = 'info', duration = 3000) {
  const toastContainer = document.getElementById('toast-container');
  if (!toastContainer) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  let icon = '';
  if (type === 'success') icon = '<i class="fas fa-check-circle"></i>';
  else if (type === 'error') icon = '<i class="fas fa-times-circle"></i>';
  else if (type === 'warning') icon = '<i class="fas fa-exclamation-triangle"></i>';
  else icon = '<i class="fas fa-info-circle"></i>';

  toast.innerHTML = `${icon} <span class="toast-message">${message}</span>`;
  toastContainer.appendChild(toast);

  setTimeout(() => toast.classList.add('show'), 100);

  setTimeout(() => {
    toast.classList.remove('show');
    toast.classList.add('hide');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  }, duration);
}

// --- Theme Management ---
function applyTheme(isDarkMode) {
  const body = document.body;
  if (isDarkMode) {
    body.classList.add('dark-mode');
    localStorage.setItem('theme', 'dark');
  } else {
    body.classList.remove('dark-mode');
    localStorage.setItem('theme', 'light');
  }
  if (cpuChart) updateChartColors(cpuChart, 'cpu');
  if (ramChart) updateChartColors(ramChart, 'ram');
  if (mountPieChart) updateChartColors(mountPieChart, 'mount');
  if (diskIOChart) updateChartColors(diskIOChart, 'diskIO');
  if (netIOChart) updateChartColors(netIOChart, 'netIO');
}

function updateChartColors(chart, type) {
  const style = getComputedStyle(document.body);
  const isDarkMode = document.body.classList.contains('dark-mode');

  const chartDoughnutBg = style.getPropertyValue('--chart-doughnut-bg').trim();
  const primaryPurple = style.getPropertyValue('--primary-purple').trim();
  const accentGreen = style.getPropertyValue('--accent-green').trim();
  const accentBlue = style.getPropertyValue('--accent-blue').trim();

  // Define zero/idle state colors for Disk/Net I/O
  const idleColor = isDarkMode ? '#404040' : '#E0E0E0'; // Darker grey for dark mode idle, lighter for light mode

  if (type === 'cpu') {
    chart.data.datasets[0].backgroundColor[0] = accentBlue;
    chart.data.datasets[0].backgroundColor[1] = chartDoughnutBg;
  } else if (type === 'ram') {
    chart.data.datasets[0].backgroundColor[0] = accentGreen;
    chart.data.datasets[0].backgroundColor[1] = chartDoughnutBg;
  } else if (type === 'mount') {
    chart.data.datasets[0].backgroundColor[0] = primaryPurple;
    chart.data.datasets[0].backgroundColor[1] = chartDoughnutBg;
  } else if (type === 'diskIO') {
    const readVal = chart.data.datasets[0].data[0];
    const writeVal = chart.data.datasets[0].data[1];
    if (readVal === 0 && writeVal === 0) {
      chart.data.datasets[0].backgroundColor = [idleColor, idleColor]; // Show full idle circle
    } else {
      chart.data.datasets[0].backgroundColor = [isDarkMode ? '#82B1FF' : '#4a2599', isDarkMode ? '#CF6679' : '#a078e3'];
    }
  } else if (type === 'netIO') {
    const sentVal = chart.data.datasets[0].data[0];
    const recvVal = chart.data.datasets[0].data[1];
    if (sentVal === 0 && recvVal === 0) {
      chart.data.datasets[0].backgroundColor = [idleColor, idleColor]; // Show full idle circle
    } else {
      chart.data.datasets[0].backgroundColor = [isDarkMode ? '#69F0AE' : '#4a2599', isDarkMode ? '#FFAB40' : '#a078e3'];
    }
  }
  chart.update();
}


// --- Chart Initialization Functions ---
function initCpuChart() {
  const ctx = document.getElementById('cpuChart').getContext('2d');
  cpuChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Used (%)', 'Free (%)'],
      datasets: [{ data: [0, 100], backgroundColor: ['var(--accent-blue)', 'var(--chart-doughnut-bg)'], borderWidth: 0 }]
    },
    options: {
      responsive: true,
      cutout: '70%',
      plugins: { legend: { display: false } },
      animation: { duration: 1000, easing: 'easeOutQuart' }
    }
  });
}

function initRamChart() {
  const ctx = document.getElementById('ramChart').getContext('2d');
  ramChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Used (%)', 'Free (%)'],
      datasets: [{ data: [0, 100], backgroundColor: ['var(--accent-green)', 'var(--chart-doughnut-bg)'], borderWidth: 0 }]
    },
    options: {
      responsive: true,
      cutout: '70%',
      plugins: { legend: { display: false } },
      animation: { duration: 1000, easing: 'easeOutQuart' }
    }
  });
}

function initMountPieChart() {
  const ctx = document.getElementById('mountPieChart').getContext('2d');
  mountPieChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Used (%)', 'Free (%)'],
      datasets: [{ data: [0, 100], backgroundColor: ['var(--primary-purple)', 'var(--chart-doughnut-bg)'], borderWidth: 0 }]
    },
    options: {
      responsive: true,
      cutout: '70%',
      plugins: { legend: { display: false } },
      animation: { duration: 1000, easing: 'easeOutQuart' }
    }
  });
}

function initDiskIOChart() {
  const ctx = document.getElementById('diskIOChart').getContext('2d');
  const isDarkMode = document.body.classList.contains('dark-mode');
  const idleColor = isDarkMode ? '#404040' : '#E0E0E0';
  diskIOChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Read (MB/s)', 'Write (MB/s)'],
      // Initialize with full idle circle if values are 0
      datasets: [{ data: [0, 100], backgroundColor: [idleColor, idleColor], borderWidth: 0 }]
    },
    options: {
      responsive: true,
      cutout: '70%',
      plugins: { legend: { display: false } },
      animation: { duration: 1000, easing: 'easeOutQuart' }
    }
  });
}

function initNetIOChart() {
  const ctx = document.getElementById('netIOChart').getContext('2d');
  const isDarkMode = document.body.classList.contains('dark-mode');
  const idleColor = isDarkMode ? '#404040' : '#E0E0E0';
  netIOChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Sent (MB/s)', 'Recv (MB/s)'],
      // Initialize with full idle circle if values are 0
      datasets: [{ data: [0, 100], backgroundColor: [idleColor, idleColor], borderWidth: 0 }]
    },
    options: {
      responsive: true,
      cutout: '70%',
      plugins: { legend: { display: false } },
      animation: { duration: 1000, easing: 'easeOutQuart' }
    }
  });
}


// --- Data Fetching & Chart Updating ---
async function updateCharts() {
  document.getElementById('cpuValue').innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
  document.getElementById('ramValue').innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
  document.getElementById('mountValue').innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
  document.getElementById('diskIOValue').innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
  document.getElementById('netIOValue').innerHTML = '<i class="fas fa-spinner fa-spin"></i>';


  try {
    const res = await fetch('/api/system-stats');
    if (!res.ok) throw new Error("Failed to fetch system stats.");
    const data = await res.json();
    cpuChart.data.datasets[0].data = [data.cpu, 100 - data.cpu];
    cpuChart.update();
    ramChart.data.datasets[0].data = [data.ram, 100 - data.ram];
    ramChart.update();
    document.getElementById('cpuValue').textContent = `${Math.round(data.cpu)}%`;
    document.getElementById('ramValue').textContent = `${Math.round(data.ram)}%`;
  } catch (err) {
    showToast(`Error fetching system stats: ${err.message}`, 'error');
    console.error("System stats error:", err);
    document.getElementById('cpuValue').textContent = '--%';
    document.getElementById('ramValue').textContent = '--%';
  }

  try {
    const res = await fetch('/api/disk-io-rate');
    if (!res.ok) throw new Error("Failed to fetch disk I/O rate.");
    const data = await res.json();
    const readRate = data.read_mb_per_s;
    const writeRate = data.write_mb_per_s;
    const isDarkMode = document.body.classList.contains('dark-mode');
    const idleColor = isDarkMode ? '#404040' : '#E0E0E0';

    if (readRate === 0 && writeRate === 0) {
      diskIOChart.data.datasets[0].data = [0, 100]; // Fill with 100 to show full circle
      diskIOChart.data.datasets[0].backgroundColor = [idleColor, idleColor];
    } else {
      diskIOChart.data.datasets[0].data = [readRate, writeRate];
      diskIOChart.data.datasets[0].backgroundColor = [isDarkMode ? '#82B1FF' : '#4a2599', isDarkMode ? '#CF6679' : '#a078e3'];
    }
    diskIOChart.update();
    document.getElementById('diskIOValue').innerHTML = `Read: ${readRate} MB/s / Write: ${writeRate} MB/s`;
  } catch (err) {
    showToast(`Error fetching disk I/O: ${err.message}`, 'error');
    console.error("Disk I/O error:", err);
    document.getElementById('diskIOValue').innerHTML = `Read: -- / Write: --`;
  }

  try {
    const res = await fetch('/api/network-io-rate');
    if (!res.ok) throw new Error("Failed to fetch network I/O rate.");
    const data = await res.json();
    const sentRate = data.sent_mb_per_s;
    const recvRate = data.recv_mb_per_s;
    const isDarkMode = document.body.classList.contains('dark-mode');
    const idleColor = isDarkMode ? '#404040' : '#E0E0E0';

    if (sentRate === 0 && recvRate === 0) {
      netIOChart.data.datasets[0].data = [0, 100]; // Fill with 100 to show full circle
      netIOChart.data.datasets[0].backgroundColor = [idleColor, idleColor];
    } else {
      netIOChart.data.datasets[0].data = [sentRate, recvRate];
      netIOChart.data.datasets[0].backgroundColor = [isDarkMode ? '#69F0AE' : '#4BC0C0', isDarkMode ? '#FFAB40' : '#FF9F40'];
    }
    netIOChart.update();
    document.getElementById('netIOValue').innerHTML = `Sent: ${sentRate} MB/s / Recv: ${recvRate} MB/s`;
  } catch (err) {
    showToast(`Error fetching network I/O: ${err.message}`, 'error');
    console.error("Network I/O error:", err);
    document.getElementById('netIOValue').innerHTML = `Sent: -- / Recv: --`;
  }

  updateLastRefreshTime();
}

async function updateMountData() {
  try {
    const res = await fetch('/api/mount-usage');
    if (!res.ok) throw new Error("Failed to fetch mount usage.");
    const data = await res.json();
    mountsData = data;
    if (mountsData.length > 0) {
      selectedMountIndex = Math.min(selectedMountIndex, mountsData.length - 1);
      renderMountPieChart();
      populateMountSelect();
    } else {
      mountPieChart.data.datasets[0].data = [0, 100];
      mountPieChart.update();
      document.getElementById('mountValue').textContent = '--%';
      document.getElementById('mountSelect').innerHTML = '<option>No mounts</option>';
    }
  } catch (err) {
    showToast(`Error fetching mount data: ${err.message}`, 'error');
    console.error("Mount data error:", err);
    mountPieChart.data.datasets[0].data = [0, 100];
    mountPieChart.update();
    document.getElementById('mountValue').textContent = '--%';
    document.getElementById('mountSelect').innerHTML = '<option>Error</option>';
  }
}

function populateMountSelect() {
  const select = document.getElementById('mountSelect');
  select.innerHTML = '';
  mountsData.forEach((mount, idx) => {
    const option = document.createElement('option');
    option.value = idx;
    option.textContent = mount.mountpoint;
    select.appendChild(option);
  });
  select.selectedIndex = selectedMountIndex;
}

function changeMount() {
  const select = document.getElementById('mountSelect');
  selectedMountIndex = select.selectedIndex;
  renderMountPieChart();
}

function renderMountPieChart() {
  if (!mountsData.length || selectedMountIndex === -1) {
    mountPieChart.data.datasets[0].data = [0, 100];
    document.getElementById('mountValue').textContent = '--%';
  } else {
    const selectedMount = mountsData[selectedMountIndex];
    const used = selectedMount.percent_used;
    const free = 100 - used;
    mountPieChart.data.datasets[0].data = [used, free];
    document.getElementById('mountValue').textContent = `${Math.round(used)}%`;
  }
  mountPieChart.update();
}

// --- Report Generation Functions ---
async function runReport(reportType, scriptApiPath, updateElementId, cardId) {
  const runButton = document.querySelector(`#${cardId} .run-btn[data-report-type="${reportType}"]`);
  const viewButton = document.querySelector(`#${cardId} .view-btn[data-report-type="${reportType}"]`);
  const downloadButton = document.querySelector(`#${cardId} .download-btn[data-report-type="${reportType}"]`);

  runButton.disabled = true;
  runButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Running...';
  viewButton.disabled = true;
  downloadButton.disabled = true;

  try {
    const res = await fetch(scriptApiPath, { 
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.detail || `Failed to run ${reportType} script`);
    }
    const data = await res.json();
    
    viewButton.dataset.currentFilename = data.filename;
    downloadButton.dataset.currentFilename = data.filename;

    document.getElementById(updateElementId).innerHTML = `<i class="far fa-clock"></i> Last update: ${data.last_modified}`;
    viewButton.disabled = false;
    downloadButton.disabled = false;
    showToast(`${reportType} report generated successfully!`, 'success');
  } catch (err) {
    showToast(`Error running ${reportType} report: ${err.message}`, 'error');
    console.error(`Error running ${reportType} report:`, err);
  } finally {
    runButton.disabled = false;
    runButton.innerHTML = '<i class="fas fa-play"></i> Run';
  }
}

async function runTablespaceReport() {
  await runReport('tablespace', '/api/run-tablespace-report', 'tablespace-last-update', 'tablespace-card');
}

async function runInvalidObjectsReport() {
  await runReport('invalid-objects', '/api/run-invalid-objects-report', 'invalid-objects-last-update', 'invalid-objects-card');
}

async function runConcurrentManagersReport() {
  await runReport('concurrent-managers', '/api/run-concurrent-managers-report', 'concurrent-managers-last-update', 'concurrent-managers-card');
}

async function runWorkflowMailerReport() {
  await runReport('workflow-mailer', '/api/run-workflow-mailer-report', 'workflow-mailer-last-update', 'workflow-mailer-card');
}

async function runTopSegmentsReport() {
  await runReport('top-segments', '/api/run-top-segments-report', 'top-segments-last-update', 'top-segments-card');
}

async function runConcurrentHistoryReport() {
  await runReport('concurrent-history', '/api/run-concurrent-history-report', 'concurrent-history-last-update', 'concurrent-history-card');
}

async function runDatabaseBackupReport() {
  await runReport('database-backup', '/api/run-database-backup-report', 'database-backup-last-update', 'database-backup-card');
}


// --- Report Viewing & Downloading ---
function handleLiveReportAction(buttonElement, action) {
  const filename = buttonElement.dataset.currentFilename;
  const reportDisplayName = buttonElement.dataset.reportDisplayName;

  if (!filename) {
    showToast("No report file available to view/download. Please run the report first.", 'warning');
    return;
  }

  if (action === 'view') {
    openModal(filename, reportDisplayName);
  } else if (action === 'download') {
    downloadReport(filename);
  }
}

function downloadReport(filename) {
  if (!filename) { 
    showToast("No report file available to download.", 'warning');
    return;
  }
  window.location.href = "/download-report/" + filename;
}

function openModal(filename, reportName) {
  if (!filename) { 
    showToast("No report file available to view.", 'warning');
    return;
  }
  const modal = document.getElementById('modal-overlay');
  const iframe = document.getElementById('modal-iframe');
  const title = document.getElementById('modal-title');
  iframe.src = "/report/" + filename;
  title.textContent = reportName;
  modal.classList.add('active');
}

function closeModal(event) {
  if (event && event.target.id !== 'modal-overlay' && event.target.id !== 'modal-close-btn') return;
  const modal = document.getElementById('modal-overlay');
  const iframe = document.getElementById('modal-iframe');
  iframe.src = "";
  modal.classList.remove('active');
}

// --- Dashboard UI Functions ---
function updateLastRefreshTime() {
  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  document.getElementById('last-refresh-time').textContent = 'Last refreshed: ' + timeStr;
}

// --- Event Listeners and Initial Load ---
document.addEventListener('DOMContentLoaded', () => {
  // --- Dark Mode Initialization ---
  const darkModeToggle = document.getElementById('darkModeToggle');
  const savedTheme = localStorage.getItem('theme');

  initCpuChart();
  initRamChart();
  initMountPieChart();
  initDiskIOChart();
  initNetIOChart();


  if (savedTheme === 'dark') {
    darkModeToggle.checked = true;
    applyTheme(true);
  } else {
    darkModeToggle.checked = false;
    applyTheme(false);
  }

  darkModeToggle.addEventListener('change', (event) => {
    applyTheme(event.target.checked);
  });
  // --- End Dark Mode Initialization ---

  updateCharts();
  updateMountData();
  updateLastRefreshTime();

  document.getElementById('refresh-btn').addEventListener('click', () => {
    updateCharts();
    updateMountData();
    showToast("Live data refreshed!", 'info');
  });

  showSection('monitor-section');

  const liveReportTypes = [
    'tablespace',
    'invalid-objects',
    'concurrent-managers',
    'workflow-mailer',
    'top-segments',
    'concurrent-history',
    'database-backup'
  ];

  const setInitialLiveReportButtonState = (reportType) => {
    const cardId = `${reportType}-card`;
    const viewBtn = document.querySelector(`#${cardId} .view-btn[data-report-type="${reportType}"]`);
    const downloadBtn = document.querySelector(`#${cardId} .download-btn[data-report-type="${reportType}"]`);
    const lastUpdateElement = document.getElementById(`${reportType}-last-update`);
    
    const initialReportData = window.live_reports_initial_state ? window.live_reports_initial_state[reportType] : null;

    if (viewBtn && downloadBtn && lastUpdateElement) {
        if (initialReportData && initialReportData.filename) {
            viewBtn.dataset.currentFilename = initialReportData.filename;
            downloadBtn.dataset.currentFilename = initialReportData.filename;
            viewBtn.disabled = false;
            downloadBtn.disabled = false;
            lastUpdateElement.innerHTML = `<i class="far fa-clock"></i> Last update: ${initialReportData.last_modified}`;
        } else {
            viewBtn.dataset.currentFilename = '';
            downloadBtn.dataset.currentFilename = '';
            viewBtn.disabled = true;
            downloadBtn.disabled = true;
            lastUpdateElement.innerHTML = `<i class="far fa-clock"></i> Last update: Not run yet`;
        }
    }
  };

  liveReportTypes.forEach(type => setInitialLiveReportButtonState(type));
});
