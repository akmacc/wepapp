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

let cpuChart = new Chart(cpuCtx, {
  type: 'doughnut',
  data: {
    labels: ['Used (%)', 'Free (%)'],
    datasets: [{ data: [0, 100], backgroundColor: ['#22c7ff', '#212942'], borderWidth: 2 }]
  },
  options: { responsive: true, cutout: '70%', plugins: { legend: { display: false }}}
});

let ramChart = new Chart(ramCtx, {
  type: 'doughnut',
  data: {
    labels: ['Used (%)', 'Free (%)'],
    datasets: [{ data: [0, 100], backgroundColor: ['#11c78e', '#212942'], borderWidth: 2 }]
  },
  options: { responsive: true, cutout: '70%', plugins: { legend: { display: false }}}
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
    options: { responsive: true, cutout: '70%', plugins: { legend: { display: false }}}
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
  const timeStr = now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'});
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

function openModal(filename, reportName) {
  const modal = document.getElementById('modal-overlay');
  const iframe = document.getElementById('modal-iframe');
  const title = document.getElementById('modal-title');
  iframe.src = "/report/" + filename;
  title.textContent = reportName;
  modal.style.display = "flex";
  modal.classList.add('active');
  modal.classList.remove('closing');
}

function closeModal(event) {
  if (event && event.target.id !== 'modal-overlay' && event.target.id !== 'modal-close-btn') return;
  const modal = document.getElementById('modal-overlay');
  // Start closing animation
  modal.classList.add('closing');
  modal.classList.remove('active');
  // Wait for animation to finish then hide modal and clear iframe
  modal.addEventListener('animationend', function handler() {
    modal.style.display = "none";
    document.getElementById('modal-iframe').src = "";
    modal.removeEventListener('animationend', handler);
  });
}

document.querySelectorAll('.sidebar-nav a').forEach(link => {
  link.addEventListener('click', () => {
    document.querySelectorAll('.sidebar-nav a').forEach(l => l.classList.remove('active'));
    link.classList.add('active');
  });
});

