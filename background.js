// Focus Mode - Background Service Worker

const DEFAULT_BLOCKLIST = [
  'facebook.com', 'twitter.com', 'x.com', 'instagram.com',
  'tiktok.com', 'reddit.com', 'youtube.com', 'twitch.tv',
  'netflix.com', 'discord.com',
];

const DEFAULT_SETTINGS = {
  focusDuration: 25,
  breakDuration: 5,
  blocklist: DEFAULT_BLOCKLIST,
  sessionsCompleted: 0,
  totalFocusMinutes: 0,
};

let focusState = {
  active: false,
  startTime: null,
  endTime: null,
  type: 'focus', // 'focus' or 'break'
};

// Install defaults
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get('settings', (result) => {
    if (!result.settings) {
      chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
    }
  });
  chrome.storage.local.set({ focusState: { active: false } });
});

// Keyboard shortcut
chrome.commands.onCommand.addListener((command) => {
  if (command === 'toggle-focus') {
    toggleFocus();
  }
});

// Message handling
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'startFocus') {
    startFocus(msg.duration).then(sendResponse);
    return true;
  }
  if (msg.action === 'stopFocus') {
    stopFocus().then(sendResponse);
    return true;
  }
  if (msg.action === 'getState') {
    getState().then(sendResponse);
    return true;
  }
  if (msg.action === 'startBreak') {
    startBreak(msg.duration).then(sendResponse);
    return true;
  }
});

// Alarm handler
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'focusEnd') {
    const result = await chrome.storage.local.get('settings');
    const settings = result.settings || DEFAULT_SETTINGS;

    if (focusState.type === 'focus') {
      settings.sessionsCompleted++;
      settings.totalFocusMinutes += settings.focusDuration;
      await chrome.storage.local.set({ settings });
    }

    await stopFocus();
    chrome.action.setBadgeText({ text: '!' });
    chrome.action.setBadgeBackgroundColor({ color: '#22c55e' });
  }
});

async function toggleFocus() {
  const state = await getState();
  if (state.active) {
    await stopFocus();
  } else {
    const result = await chrome.storage.local.get('settings');
    const settings = result.settings || DEFAULT_SETTINGS;
    await startFocus(settings.focusDuration);
  }
}

async function startFocus(duration) {
  const result = await chrome.storage.local.get('settings');
  const settings = result.settings || DEFAULT_SETTINGS;

  focusState = {
    active: true,
    startTime: Date.now(),
    endTime: Date.now() + duration * 60 * 1000,
    type: 'focus',
  };

  await chrome.storage.local.set({ focusState });
  await updateBlockRules(settings.blocklist);
  await chrome.alarms.create('focusEnd', { delayInMinutes: duration });

  chrome.action.setBadgeText({ text: duration + '' });
  chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });

  // Update badge every minute
  chrome.alarms.create('updateBadge', { periodInMinutes: 1 });

  return { success: true };
}

async function startBreak(duration) {
  focusState = {
    active: true,
    startTime: Date.now(),
    endTime: Date.now() + duration * 60 * 1000,
    type: 'break',
  };

  await chrome.storage.local.set({ focusState });
  await clearBlockRules();
  await chrome.alarms.create('focusEnd', { delayInMinutes: duration });

  chrome.action.setBadgeText({ text: 'BRK' });
  chrome.action.setBadgeBackgroundColor({ color: '#22c55e' });

  return { success: true };
}

async function stopFocus() {
  focusState = { active: false, startTime: null, endTime: null, type: 'focus' };
  await chrome.storage.local.set({ focusState });
  await clearBlockRules();
  await chrome.alarms.clear('focusEnd');
  await chrome.alarms.clear('updateBadge');
  chrome.action.setBadgeText({ text: '' });

  return { success: true };
}

async function getState() {
  const result = await chrome.storage.local.get(['focusState', 'settings']);
  const state = result.focusState || { active: false };
  const settings = result.settings || DEFAULT_SETTINGS;

  // Sync in-memory state
  if (state.active) {
    focusState = state;
  }

  return {
    ...state,
    settings,
    remaining: state.active ? Math.max(0, state.endTime - Date.now()) : 0,
  };
}

async function updateBlockRules(blocklist) {
  const rules = blocklist.map((domain, i) => ({
    id: i + 1,
    priority: 1,
    action: {
      type: 'redirect',
      redirect: {
        url: chrome.runtime.getURL('blocked.html') + '?site=' + encodeURIComponent(domain),
      },
    },
    condition: {
      urlFilter: '||' + domain,
      resourceTypes: ['main_frame'],
    },
  }));

  // Clear existing dynamic rules
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const removeIds = existing.map(r => r.id);

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: removeIds,
    addRules: rules,
  });
}

async function clearBlockRules() {
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const removeIds = existing.map(r => r.id);
  if (removeIds.length > 0) {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: removeIds,
    });
  }
}
