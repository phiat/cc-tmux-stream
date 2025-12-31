(function() {
  'use strict';

  const serverUrlInput = document.getElementById('serverUrl');
  const tokenInput = document.getElementById('token');
  const saveBtn = document.getElementById('save');
  const statusDiv = document.getElementById('status');

  // Load saved settings
  async function loadSettings() {
    try {
      const result = await browser.storage.local.get(['serverUrl', 'token']);
      serverUrlInput.value = result.serverUrl || 'ws://127.0.0.1:19475';
      tokenInput.value = result.token || '';
    } catch (e) {
      console.error('Failed to load settings:', e);
    }
  }

  // Save settings
  async function saveSettings() {
    const serverUrl = serverUrlInput.value.trim();
    const token = tokenInput.value.trim();

    // Basic validation
    if (!serverUrl) {
      showStatus('Server URL is required', 'error');
      return;
    }

    if (!serverUrl.startsWith('ws://') && !serverUrl.startsWith('wss://')) {
      showStatus('Server URL must start with ws:// or wss://', 'error');
      return;
    }

    try {
      await browser.storage.local.set({ serverUrl, token });
      showStatus('Settings saved successfully!', 'success');
    } catch (e) {
      showStatus('Failed to save settings: ' + e.message, 'error');
    }
  }

  function showStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.className = 'status ' + type;

    // Auto-hide success messages
    if (type === 'success') {
      setTimeout(() => {
        statusDiv.className = 'status';
      }, 3000);
    }
  }

  // Event listeners
  saveBtn.addEventListener('click', saveSettings);

  // Save on Enter key in inputs
  serverUrlInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') saveSettings();
  });
  tokenInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') saveSettings();
  });

  // Initialize
  loadSettings();
})();
