document.addEventListener('DOMContentLoaded', async () => {
  await refreshState();
  setupListeners();
  setInterval(refreshState, 1000);
});

let selectedDuration = 25;

function setupListeners() {
  document.getElementById('startBtn').addEventListener('click', startFocus);
  document.getElementById('stopBtn').addEventListener('click', stopFocus);
  document.getElementById('breakBtn').addEventListener('click', startBreak);
  document.getElementById('toggleList').addEventListener('click', toggleBlocklist);
  document.getElementById('addSiteBtn').addEventListener('click', addSite);
  document.getElementById('newSite').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addSite();
  });

  document.querySelectorAll('.dur-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.dur-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedDuration = parseInt(btn.dataset.min);
      document.getElementById('timer').textContent = selectedDuration + ':00';
    });
  });
}

async function refreshState() {
  const state = await chrome.runtime.sendMessage({ action: 'getState' });
  updateUI(state);
}

function updateUI(state) {
  const dot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const ring = document.getElementById('ring');

  // Stats
  document.getElementById('sessionCount').textContent = state.settings?.sessionsCompleted || 0;
  document.getElementById('totalMinutes').textContent = state.settings?.totalFocusMinutes || 0;
  document.getElementById('blockedCount').textContent = state.settings?.blocklist?.length || 0;

  if (state.active) {
    const remaining = Math.max(0, state.endTime - Date.now());
    const mins = Math.floor(remaining / 60000);
    const secs = Math.floor((remaining % 60000) / 1000);
    document.getElementById('timer').textContent =
      String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0');

    const totalMs = state.endTime - state.startTime;
    const elapsed = totalMs - remaining;
    const progress = totalMs > 0 ? elapsed / totalMs : 0;
    const circumference = 2 * Math.PI * 70; // 440
    ring.style.strokeDashoffset = circumference * (1 - progress);

    if (state.type === 'break') {
      dot.className = 'status-dot break';
      statusText.textContent = 'Break';
      document.getElementById('timerLabel').textContent = 'Break time';
      ring.style.stroke = '#22c55e';
    } else {
      dot.className = 'status-dot active';
      statusText.textContent = 'Focusing';
      document.getElementById('timerLabel').textContent = 'Stay focused';
      ring.style.stroke = '#8b5cf6';
    }

    document.getElementById('idleControls').classList.add('hidden');
    document.getElementById('activeControls').classList.remove('hidden');
    document.getElementById('durationRow').classList.add('hidden');
  } else {
    dot.className = 'status-dot';
    statusText.textContent = 'Idle';
    document.getElementById('timerLabel').textContent = 'Ready to focus';
    document.getElementById('timer').textContent = selectedDuration + ':00';
    ring.style.strokeDashoffset = 440;
    ring.style.stroke = '#8b5cf6';

    document.getElementById('idleControls').classList.remove('hidden');
    document.getElementById('activeControls').classList.add('hidden');
    document.getElementById('durationRow').classList.remove('hidden');
  }
}

async function startFocus() {
  await chrome.runtime.sendMessage({ action: 'startFocus', duration: selectedDuration });
  await refreshState();
}

async function stopFocus() {
  await chrome.runtime.sendMessage({ action: 'stopFocus' });
  await refreshState();
}

async function startBreak() {
  const state = await chrome.runtime.sendMessage({ action: 'getState' });
  const breakDuration = state.settings?.breakDuration || 5;
  await chrome.runtime.sendMessage({ action: 'startBreak', duration: breakDuration });
  await refreshState();
}

function toggleBlocklist() {
  const list = document.getElementById('blocklist');
  const addRow = document.getElementById('addSiteRow');
  const btn = document.getElementById('toggleList');

  if (list.classList.contains('hidden')) {
    list.classList.remove('hidden');
    addRow.classList.remove('hidden');
    btn.textContent = 'Hide';
    renderBlocklist();
  } else {
    list.classList.add('hidden');
    addRow.classList.add('hidden');
    btn.textContent = 'Edit';
  }
}

async function renderBlocklist() {
  const state = await chrome.runtime.sendMessage({ action: 'getState' });
  const sites = state.settings?.blocklist || [];
  const container = document.getElementById('blocklist');

  container.innerHTML = sites.map((site, i) => `
    <div class="block-item">
      <span>${site}</span>
      <button class="remove-btn" data-index="${i}">&times;</button>
    </div>
  `).join('');

  container.querySelectorAll('.remove-btn').forEach(btn => {
    btn.addEventListener('click', () => removeSite(parseInt(btn.dataset.index)));
  });
}

async function addSite() {
  const input = document.getElementById('newSite');
  let site = input.value.trim().toLowerCase();
  if (!site) return;

  // Clean up URL
  site = site.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
  if (!site.includes('.')) return;

  const state = await chrome.runtime.sendMessage({ action: 'getState' });
  const settings = state.settings;
  if (!settings.blocklist.includes(site)) {
    settings.blocklist.push(site);
    await chrome.storage.local.set({ settings });
  }

  input.value = '';
  renderBlocklist();
  document.getElementById('blockedCount').textContent = settings.blocklist.length;
}

async function removeSite(index) {
  const state = await chrome.runtime.sendMessage({ action: 'getState' });
  const settings = state.settings;
  settings.blocklist.splice(index, 1);
  await chrome.storage.local.set({ settings });
  renderBlocklist();
  document.getElementById('blockedCount').textContent = settings.blocklist.length;
}
