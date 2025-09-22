function logout() {
  window.location.href = "/logout";
}

function showSection(section) {
  document.getElementById('monitor-section').style.display = section === 'monitor' ? 'block' : 'none';
  document.getElementById('reports-section').style.display = section === 'reports' ? 'block' : 'none';
  document.getElementById('nav-monitor').classList.toggle('active', section === 'monitor');
  document.getElementById('nav-reports').classList.toggle('active', section === 'reports');
}

const cpuCtx = document.getElementById('cpuChart').getContext('2d');
const ramCtx = document.getElementById('ramChart').getContext('2d');
const mountPieCtx = document.getElementById('mountPieChart').getContext('2d');
const diskIOCtx = document.getElementById('diskIOChart').getContext('2d');
const netIOCtx = document.getElementById('netIOChart').getContext('2d');

let cpuChart = new Chart(cpuCtx, {
  type: 'doughnut',
  data: {
    labels: ['Used (%)', 'Free (%)'],
    datasets: [{ data: [0, 100], backgroundColor: ['#22c7ff', '#212942'], borderWidth: 2 }]
  },
  options: { responsive: true, cutout: '70%', plugins: { legend: { display: false } } }
});

let ramChart = new Chart(ramCtx, {
  type: 'doughnut',
  data: {
    labels: ['Used (%)', 'Free (%)'],
    datasets: [{ data: [0, 100], backgroundColor: ['#11c78e', '#212942'], borderWidth: 2 }]
  },
  options: { responsive: true, cutout: '70%', plugins: { legend: { display: false } } }
});

// Disk I/O doughnut chart (Read/Write total mapped to percentage style)
let diskIOChart = new Chart(diskIOCtx, {
  type: 'doughnut',
  data: {
    labels: ['Read (MB/s)', 'Write (MB/s)'],
    datasets: [
      {
        data: [0, 0], // read, write
        backgroundColor: ['#ff6384', '#36a2eb'],
        borderWidth: 2
      }
    ]
  },
  options: {
    responsive: true,
    cutout: '70%',
    plugins: { legend: { display: false } }
  }
});

// Network I/O doughnut chart (Sent/Recv total mapped to percentage style)
let netIOChart = new Chart(netIOCtx, {
  type: 'doughnut',
  data: {
    labels: ['Sent (MB/s)', 'Recv (MB/s)'],
    datasets: [
      {
        data: [0, 0], // sent, recv
        backgroundColor: ['#ff9f40', '#4bc0c0'],
        borderWidth: 2
      }
    ]
  },
  options: {
    responsive: true,
    cutout: '70%',
    plugins: { legend: { display: false } }
  }
});

let mountPieChart = null;
let mountsData = [];
let selectedMountIndex = 0;

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
  if (!mountsData.length) return;
  const selectedMount = mountsData[selectedMountIndex];
  const used = selectedMount.percent_used;
  const free = 100 - used;
  if (mountPieChart) mountPieChart.destroy();
  mountPieChart = new Chart(mountPieCtx, {
    type: 'doughnut',
    data: {
      labels: ['Used (%)', 'Free (%)'],
      datasets: [{ data: [used, free], backgroundColor: ['#22c7ff', '#212942'], borderWidth: 2 }]
    },
    options: { responsive: true, cutout: '70%', plugins: { legend: { display: false } } }
  });
  document.getElementById('mountValue').textContent = Math.round(used) + '%';
}

function updateCharts() {
  fetch('/api/system-stats')
    .then(res => res.json())
    .then(data => {
      cpuChart.data.datasets[0].data = [data.cpu, 100 - data.cpu];
      cpuChart.update();
      ramChart.data.datasets[0].data = [data.ram, 100 - data.ram];
      ramChart.update();
      document.getElementById('cpuValue').textContent = Math.round(data.cpu) + '%';
      document.getElementById('ramValue').textContent = Math.round(data.ram) + '%';
    });

  fetch('/api/disk-io-rate')
  .then(res => res.json())
  .then(data => {
    diskIOChart.data.datasets[0].data = [data.read_mb_per_s, data.write_mb_per_s];
    diskIOChart.update();
    document.getElementById('diskIOValue').textContent =
      `Read: ${data.read_mb_per_s} MB/s / Write: ${data.write_mb_per_s} MB/s`;;
  });

fetch('/api/network-io-rate')
  .then(res => res.json())
  .then(data => {
    netIOChart.data.datasets[0].data = [data.sent_mb_per_s, data.recv_mb_per_s];
    netIOChart.update();
    document.getElementById('netIOValue').textContent =
      `Sent: ${data.sent_mb_per_s} MB/s / Recv: ${data.recv_mb_per_s} MB/s`;
  });

}

function updateMountData() {
  fetch('/api/mount-usage')
    .then(res => res.json())
    .then(data => {
      mountsData = data;
      if (mountsData.length > 0) {
        selectedMountIndex = 0;
        renderMountPieChart();
        populateMountSelect();
      }
    });
}

function downloadReport(filename) {
  window.location.href = "/download-report/" + filename;
}

function openModal(filename, reportName) {
  const modal = document.getElementById('modal-overlay');
  const iframe = document.getElementById('modal-iframe');
  const title = document.getElementById('modal-title');
  iframe.src = "/report/" + filename;
  title.textContent = reportName;
  modal.style.display = "flex";
  modal.classList.add('active');
}

function closeModal(event) {
  if (event && event.target.id !== 'modal-overlay' && event.target.id !== 'modal-close-btn') return;
  const modal = document.getElementById('modal-overlay');
  const iframe = document.getElementById('modal-iframe');
  iframe.src = "";
  modal.style.display = "none";
  modal.classList.remove('active');
}

function updateLastRefreshTime() {
  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  document.getElementById('last-refresh-time').textContent = 'Last refreshed: ' + timeStr;
}

function showMessage(msg) {
  const el = document.getElementById('refresh-message');
  if (!el) return;
  el.textContent = msg;
  el.style.display = "block";
  setTimeout(() => { el.style.display = "none"; }, 2000);
}

document.getElementById('refresh-btn').addEventListener('click', () => {
  updateCharts();
  updateMountData();
  updateLastRefreshTime();
});

// Initial load update
updateCharts();
updateMountData();
updateLastRefreshTime();

document.querySelectorAll('.sidebar-nav a').forEach(link => {
  link.addEventListener('click', () => {
    document.querySelectorAll('.sidebar-nav a').forEach(l => l.classList.remove('active'));
    link.classList.add('active');
  });
});

