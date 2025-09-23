// --- Global State Variables ---
let cpuChart, ramChart, mountPieChart, diskIOChart, netIOChart;
let mountsData = [];
let selectedMountIndex = 0;
// No longer relying on these global variables for 'current' filenames in handleLiveReportAction
// let tablespaceReportFilename = "";
// let invalidObjectsReportFilename = "";

// --- Utility Functions ---
function logout() {
  window.location.href = "/logout";
}

function showSection(contentSectionId) {
  const sections = ['monitor-section', 'live-report-section', 'reports-section'];
  const navMap = { // Direct mapping for content sections to nav item IDs
    'monitor-section': 'nav-monitor',
    'live-report-section': 'nav-live-report',
    'reports-section': 'nav-reports'
  };

  sections.forEach(id => {
    const section = document.getElementById(id);
    const navItemId = navMap[id]; // Get the correct nav item ID from the map
    const navItem = document.getElementById(navItemId);

    if (id === contentSectionId) {
      // Show section: first set display block to take space, then animate opacity/transform
      section.style.display = 'block';
      setTimeout(() => {
        section.classList.add('active-section');
      }, 10); // Small delay to allow browser to register display:block
      if (navItem) navItem.classList.add('active'); // Ensure nav item is active
    } else {
      // Hide section: animate out, then set display none
      if (navItem) navItem.classList.remove('active'); // Ensure nav item is inactive
      section.classList.remove('active-section');
      section.addEventListener('transitionend', function handler() {
        if (!section.classList.contains('active-section')) { // Ensure it's still inactive
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

  // Animate in
  setTimeout(() => toast.classList.add('show'), 100);

  // Animate out and remove
  setTimeout(() => {
    toast.classList.remove('show');
    toast.classList.add('hide');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  }, duration);
}

// --- Chart Initialization Functions ---
function initCpuChart() {
  const ctx = document.getElementById('cpuChart').getContext('2d');
  cpuChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Used (%)', 'Free (%)'],
      datasets: [{ data: [0, 100], backgroundColor: ['var(--accent-blue)', '#E0E0E0'], borderWidth: 0 }]
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
      datasets: [{ data: [0, 100], backgroundColor: ['var(--accent-green)', '#E0E0E0'], borderWidth: 0 }]
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
      datasets: [{ data: [0, 100], backgroundColor: ['var(--primary-purple)', '#E0E0E0'], borderWidth: 0 }]
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
  diskIOChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Read (MB/s)', 'Write (MB/s)'],
      datasets: [{ data: [0, 0], backgroundColor: ['#36A2EB', '#FF6384'], borderWidth: 0 }]
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
  netIOChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Sent (MB/s)', 'Recv (MB/s)'],
      datasets: [{ data: [0, 0], backgroundColor: ['#4BC0C0', '#FF9F40'], borderWidth: 0 }]
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
  // Set initial loading states for values
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
    document.getElementById('cpuValue').textContent = '--%';
    document.getElementById('ramValue').textContent = '--%';
  }

  try {
    const res = await fetch('/api/disk-io-rate');
    if (!res.ok) throw new Error("Failed to fetch disk I/O rate.");
    const data = await res.json();
    diskIOChart.data.datasets[0].data = [data.read_mb_per_s, data.write_mb_per_s];
    diskIOChart.update();
    document.getElementById('diskIOValue').innerHTML = `Read: ${data.read_mb_per_s} MB/s / Write: ${data.write_mb_per_s} MB/s`;
  } catch (err) {
    showToast(`Error fetching disk I/O: ${err.message}`, 'error');
    document.getElementById('diskIOValue').innerHTML = `Read: -- / Write: --`;
  }

  try {
    const res = await fetch('/api/network-io-rate');
    if (!res.ok) throw new Error("Failed to fetch network I/O rate.");
    const data = await res.json();
    netIOChart.data.datasets[0].data = [data.sent_mb_per_s, data.recv_mb_per_s];
    netIOChart.update();
    document.getElementById('netIOValue').innerHTML = `Sent: ${data.sent_mb_per_s} MB/s / Recv: ${data.recv_mb_per_s} MB/s`;
  } catch (err) {
    showToast(`Error fetching network I/O: ${err.message}`, 'error');
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
    const res = await fetch(scriptApiPath, { method: 'POST' });
    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.error || `Failed to run ${reportType} script`);
    }
    const data = await res.json();
    
    // Update data-current-filename attribute on buttons for direct access
    viewButton.dataset.currentFilename = data.filename;
    downloadButton.dataset.currentFilename = data.filename;

    document.getElementById(updateElementId).innerHTML = `<i class="far fa-clock"></i> Last update: ${data.last_modified}`;
    viewButton.disabled = false;
    downloadButton.disabled = false;
    showToast(`${reportType} report generated successfully!`, 'success');
  } catch (err) {
    showToast(`Error running ${reportType} report: ${err.message}`, 'error');
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


// --- Report Viewing & Downloading ---
// New helper function for live reports' view/download buttons
function handleLiveReportAction(buttonElement, action) {
  const filename = buttonElement.dataset.currentFilename; // Get filename directly from button
  const reportDisplayName = buttonElement.dataset.reportDisplayName; // Get display name from button

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
  // Initialize charts
  initCpuChart();
  initRamChart();
  initMountPieChart();
  initDiskIOChart();
  initNetIOChart();

  // Initial data load
  updateCharts();
  updateMountData();
  updateLastRefreshTime();

  // Set up refresh button
  document.getElementById('refresh-btn').addEventListener('click', () => {
    updateCharts();
    updateMountData();
    showToast("Live data refreshed!", 'info');
  });

  // Activate default section and nav item
  showSection('monitor-section');

  // Set initial state for live report buttons by checking data-current-filename attribute
  const setInitialLiveReportButtonState = (cardId, reportType) => {
    const viewBtn = document.querySelector(`#${cardId} .view-btn[data-report-type="${reportType}"]`);
    const downloadBtn = document.querySelector(`#${cardId} .download-btn[data-report-type="${reportType}"]`);
    
    // Check if the 'Last update' text indicates a report was run (meaning a file might exist)
    const lastUpdateElement = document.getElementById(`${reportType}-last-update`);
    const isReportRun = lastUpdateElement && !lastUpdateElement.textContent.includes('Not run yet');

    // On initial load, if a report was previously generated, the backend might have set a filename.
    // For simplicity, we assume if `isReportRun` is true, a filename (even a dummy one) exists.
    // In a production app, the backend would pass the actual filename via a data attribute
    // on the 'last-update' div or directly on the buttons from the Jinja context.
    const initialFilename = isReportRun ? 'placeholder.html' : ''; // placeholder.html will be replaced by actual filename when run

    if (viewBtn) {
        viewBtn.dataset.currentFilename = initialFilename;
        viewBtn.disabled = !initialFilename;
    }
    if (downloadBtn) {
        downloadBtn.dataset.currentFilename = initialFilename;
        downloadBtn.disabled = !initialFilename;
    }
  };

  setInitialLiveReportButtonState('tablespace-card', 'tablespace');
  setInitialLiveReportButtonState('invalid-objects-card', 'invalid-objects');
});
