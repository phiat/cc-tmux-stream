(function() {
  'use strict';

  // DOM elements
  const statusIndicator = document.getElementById('status-indicator');
  const statusText = document.getElementById('status-text');
  const paneSelector = document.getElementById('pane-selector');
  const refreshBtn = document.getElementById('refresh-btn');
  const connectBtn = document.getElementById('connect-btn');
  const contentContainer = document.getElementById('content-container');
  const terminalContent = document.getElementById('terminal-content');
  const quickButtons = document.querySelectorAll('.quick-btn');
  const navButtons = document.querySelectorAll('.nav-btn');
  const textInput = document.getElementById('text-input');
  const sendBtn = document.getElementById('send-btn');
  const scrollBottomBtn = document.getElementById('scroll-bottom-btn');

  // State
  let ws = null;
  let lastContent = null;
  let settings = {
    serverUrl: 'ws://127.0.0.1:19475',
    token: ''
  };

  // Enable/disable input controls
  function setInputEnabled(enabled) {
    quickButtons.forEach(btn => btn.disabled = !enabled);
    navButtons.forEach(btn => btn.disabled = !enabled);
    textInput.disabled = !enabled;
    sendBtn.disabled = !enabled;
  }

  // Update UI state
  function setStatus(status) {
    statusIndicator.className = '';
    switch (status) {
      case 'disconnected':
        statusText.textContent = 'Disconnected';
        connectBtn.textContent = 'Connect';
        connectBtn.disabled = false;
        paneSelector.disabled = true;
        refreshBtn.disabled = true;
        setInputEnabled(false);
        break;
      case 'connecting':
        statusIndicator.classList.add('connecting');
        statusText.textContent = 'Connecting...';
        connectBtn.textContent = 'Cancel';
        connectBtn.disabled = false;
        setInputEnabled(false);
        break;
      case 'authenticating':
        statusIndicator.classList.add('connecting');
        statusText.textContent = 'Authenticating...';
        connectBtn.disabled = true;
        setInputEnabled(false);
        break;
      case 'connected':
        statusIndicator.classList.add('connected');
        statusText.textContent = 'Connected';
        connectBtn.textContent = 'Disconnect';
        connectBtn.disabled = false;
        paneSelector.disabled = false;
        refreshBtn.disabled = false;
        setInputEnabled(false);
        break;
      case 'subscribed':
        statusIndicator.classList.add('connected');
        statusText.textContent = 'Streaming';
        connectBtn.textContent = 'Disconnect';
        connectBtn.disabled = false;
        paneSelector.disabled = false;
        refreshBtn.disabled = false;
        setInputEnabled(true);
        break;
    }
  }

  // Display message in content area
  function showMessage(text, type = 'status') {
    const span = document.createElement('span');
    span.className = type + '-message';
    span.textContent = text + '\n';
    terminalContent.appendChild(span);
    contentContainer.scrollTop = contentContainer.scrollHeight;
  }

  // Clear content area
  function clearContent() {
    terminalContent.textContent = '';
  }

  // ANSI color codes to CSS
  const ANSI_COLORS = {
    // Standard colors (30-37, 40-47)
    30: '#000000', 31: '#cd3131', 32: '#0dbc79', 33: '#e5e510',
    34: '#2472c8', 35: '#bc3fbc', 36: '#11a8cd', 37: '#e5e5e5',
    // Bright colors (90-97, 100-107)
    90: '#666666', 91: '#f14c4c', 92: '#23d18b', 93: '#f5f543',
    94: '#3b8eea', 95: '#d670d6', 96: '#29b8db', 97: '#ffffff'
  };

  // 256-color palette (simplified - basic + bright + grayscale)
  function get256Color(n) {
    if (n < 16) {
      // Standard + bright colors
      const colors = [
        '#000000', '#cd3131', '#0dbc79', '#e5e510', '#2472c8', '#bc3fbc', '#11a8cd', '#e5e5e5',
        '#666666', '#f14c4c', '#23d18b', '#f5f543', '#3b8eea', '#d670d6', '#29b8db', '#ffffff'
      ];
      return colors[n];
    } else if (n < 232) {
      // 216 color cube (6x6x6)
      const idx = n - 16;
      const r = Math.floor(idx / 36) * 51;
      const g = Math.floor((idx % 36) / 6) * 51;
      const b = (idx % 6) * 51;
      return `rgb(${r},${g},${b})`;
    } else {
      // Grayscale (24 shades)
      const gray = (n - 232) * 10 + 8;
      return `rgb(${gray},${gray},${gray})`;
    }
  }

  // Parse ANSI escape sequences and convert to HTML
  function ansiToHtml(text) {
    let result = '';
    let currentFg = null;
    let currentBg = null;
    let bold = false;
    let dim = false;
    let italic = false;
    let underline = false;

    let i = 0;
    while (i < text.length) {
      if (text[i] === '\x1b' && text[i + 1] === '[') {
        // Parse escape sequence
        let j = i + 2;
        let seq = '';
        while (j < text.length && !text[j].match(/[a-zA-Z]/)) {
          seq += text[j];
          j++;
        }
        const cmd = text[j];
        i = j + 1;

        if (cmd === 'm') {
          // SGR (Select Graphic Rendition)
          const codes = seq ? seq.split(';').map(Number) : [0];

          for (let k = 0; k < codes.length; k++) {
            const code = codes[k];

            if (code === 0) {
              // Reset
              currentFg = null;
              currentBg = null;
              bold = false;
              dim = false;
              italic = false;
              underline = false;
            } else if (code === 1) {
              bold = true;
            } else if (code === 2) {
              dim = true;
            } else if (code === 3) {
              italic = true;
            } else if (code === 4) {
              underline = true;
            } else if (code === 22) {
              bold = false;
              dim = false;
            } else if (code === 23) {
              italic = false;
            } else if (code === 24) {
              underline = false;
            } else if (code >= 30 && code <= 37) {
              currentFg = ANSI_COLORS[code];
            } else if (code === 38) {
              // Extended foreground color
              if (codes[k + 1] === 5 && codes[k + 2] !== undefined) {
                currentFg = get256Color(codes[k + 2]);
                k += 2;
              } else if (codes[k + 1] === 2 && codes[k + 4] !== undefined) {
                currentFg = `rgb(${codes[k + 2]},${codes[k + 3]},${codes[k + 4]})`;
                k += 4;
              }
            } else if (code === 39) {
              currentFg = null;
            } else if (code >= 40 && code <= 47) {
              currentBg = ANSI_COLORS[code - 10];
            } else if (code === 48) {
              // Extended background color
              if (codes[k + 1] === 5 && codes[k + 2] !== undefined) {
                currentBg = get256Color(codes[k + 2]);
                k += 2;
              } else if (codes[k + 1] === 2 && codes[k + 4] !== undefined) {
                currentBg = `rgb(${codes[k + 2]},${codes[k + 3]},${codes[k + 4]})`;
                k += 4;
              }
            } else if (code === 49) {
              currentBg = null;
            } else if (code >= 90 && code <= 97) {
              currentFg = ANSI_COLORS[code];
            } else if (code >= 100 && code <= 107) {
              currentBg = ANSI_COLORS[code - 10];
            }
          }
        }
        // Skip other escape sequences (cursor positioning, etc.)
      } else if (text[i] === '<') {
        result += '&lt;';
        i++;
      } else if (text[i] === '>') {
        result += '&gt;';
        i++;
      } else if (text[i] === '&') {
        result += '&amp;';
        i++;
      } else {
        // Build style string
        let style = '';
        if (currentFg) style += `color:${currentFg};`;
        if (currentBg) style += `background:${currentBg};`;
        if (bold) style += 'font-weight:bold;';
        if (dim) style += 'opacity:0.7;';
        if (italic) style += 'font-style:italic;';
        if (underline) style += 'text-decoration:underline;';

        if (style) {
          result += `<span style="${style}">${escapeChar(text[i])}</span>`;
        } else {
          result += escapeChar(text[i]);
        }
        i++;
      }
    }

    return result;
  }

  function escapeChar(c) {
    if (c === '<') return '&lt;';
    if (c === '>') return '&gt;';
    if (c === '&') return '&amp;';
    return c;
  }

  // Spinner characters to replace with stable indicator
  const SPINNER_CHARS = /[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏⣾⣽⣻⢿⡿⣟⣯⣷◐◓◑◒◴◷◶◵◰◳◲◱▖▘▝▗⠁⠂⠄⡀⢀⠠⠐⠈✢✦✧⟐⋆]/g;
  const SPINNER_REPLACEMENT = '◆';

  // Normalize spinners to prevent text wiggle
  function normalizeSpinners(text) {
    return text.replace(SPINNER_CHARS, SPINNER_REPLACEMENT);
  }

  // Safely set HTML content using DOMParser (no innerHTML assignment)
  const domParser = new DOMParser();
  function safeSetHtml(element, html) {
    const doc = domParser.parseFromString('<div>' + html + '</div>', 'text/html');
    const content = doc.body.firstChild;
    element.replaceChildren(...content.childNodes);
  }

  // Display terminal content with ANSI colors
  function displayContent(text) {
    // Check if user is scrolled to bottom (following mode)
    const isAtBottom = contentContainer.scrollHeight - contentContainer.scrollTop - contentContainer.clientHeight < 50;

    // Use safe HTML insertion via template element
    safeSetHtml(terminalContent, ansiToHtml(normalizeSpinners(text)));

    // Auto-scroll to bottom only if user was already at bottom
    if (isAtBottom) {
      contentContainer.scrollTop = contentContainer.scrollHeight;
    }
  }

  // Load settings from storage
  async function loadSettings() {
    try {
      const result = await browser.storage.local.get(['serverUrl', 'token']);
      if (result.serverUrl) settings.serverUrl = result.serverUrl;
      if (result.token) settings.token = result.token;
    } catch (e) {
      console.error('Failed to load settings:', e);
    }
  }

  // Connect to WebSocket server
  function connect() {
    if (ws) {
      ws.close();
      ws = null;
      setStatus('disconnected');
      return;
    }

    if (!settings.token) {
      showMessage('Error: No token configured. Go to extension options to set the token.', 'error');
      return;
    }

    setStatus('connecting');
    clearContent();
    showMessage(`Connecting to ${settings.serverUrl}...`);

    try {
      ws = new WebSocket(settings.serverUrl);
    } catch (e) {
      showMessage(`Error: ${e.message}`, 'error');
      setStatus('disconnected');
      return;
    }

    ws.onopen = () => {
      setStatus('authenticating');
      showMessage('Connected. Authenticating...');
      ws.send(JSON.stringify({ type: 'auth', token: settings.token }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        handleMessage(msg);
      } catch (e) {
        console.error('Failed to parse message:', e);
      }
    };

    ws.onerror = (event) => {
      showMessage('WebSocket error. Is the daemon running?', 'error');
    };

    ws.onclose = () => {
      ws = null;
      lastContent = null;
      setStatus('disconnected');
      showMessage('Disconnected.');
    };
  }

  // Handle incoming messages
  function handleMessage(msg) {
    switch (msg.type) {
      case 'auth_ok':
        showMessage('Authenticated successfully.', 'success');
        setStatus('connected');
        requestPaneList();
        break;

      case 'auth_error':
        showMessage(`Authentication failed: ${msg.message}`, 'error');
        ws.close();
        break;

      case 'panes':
        populatePaneSelector(msg.items);
        break;

      case 'content':
        // Only update if content changed
        if (msg.data !== lastContent) {
          lastContent = msg.data;
          displayContent(msg.data);
        }
        setStatus('subscribed');
        break;

      case 'error':
        showMessage(`Error: ${msg.message}`, 'error');
        break;
    }
  }

  // Request list of panes
  function requestPaneList() {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'list' }));
    }
  }

  // Populate pane selector dropdown
  function populatePaneSelector(panes) {
    paneSelector.innerHTML = '<option value="">Select pane...</option>';

    for (const pane of panes) {
      const option = document.createElement('option');
      option.value = pane.id;
      const activeMarker = pane.active ? ' *' : '';
      option.textContent = `${pane.session}:${pane.window_name}.${pane.pane}${activeMarker} - ${pane.title}`;
      paneSelector.appendChild(option);
    }

    // Auto-select if only one pane
    if (panes.length === 1) {
      paneSelector.value = panes[0].id;
      subscribe(panes[0].id);
    }
  }

  // Subscribe to a pane
  function subscribe(target) {
    if (ws && ws.readyState === WebSocket.OPEN && target) {
      lastContent = null;
      clearContent();
      showMessage(`Subscribing to ${target}...`);
      ws.send(JSON.stringify({ type: 'subscribe', target }));
    }
  }

  // Send input to tmux
  function sendInput(keys) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'input', keys }));
    }
  }

  // Event listeners
  connectBtn.addEventListener('click', connect);

  // Quick buttons (send single key)
  quickButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const keys = btn.dataset.keys;
      if (keys) {
        sendInput(keys);
      }
    });
  });

  // Nav buttons (send special keys directly)
  navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const keys = btn.dataset.keys;
      if (keys) {
        sendInput(keys);
      }
    });
  });

  // Text input (sends text + Enter)
  sendBtn.addEventListener('click', () => {
    const text = textInput.value.trim();
    if (text) {
      sendInput(text + ' Enter');
      textInput.value = '';
    }
  });

  textInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const text = textInput.value.trim();
      if (text) {
        sendInput(text + ' Enter');
        textInput.value = '';
      }
    }
  });

  refreshBtn.addEventListener('click', () => {
    requestPaneList();
  });

  // Scroll to bottom button
  scrollBottomBtn.addEventListener('click', () => {
    contentContainer.scrollTop = contentContainer.scrollHeight;
  });

  // Show/hide scroll button based on scroll position
  contentContainer.addEventListener('scroll', () => {
    const isAtBottom = contentContainer.scrollHeight - contentContainer.scrollTop - contentContainer.clientHeight < 50;
    scrollBottomBtn.classList.toggle('visible', !isAtBottom);
  });

  paneSelector.addEventListener('change', (e) => {
    if (e.target.value) {
      subscribe(e.target.value);
    }
  });

  // Listen for settings changes
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
      if (changes.serverUrl) settings.serverUrl = changes.serverUrl.newValue;
      if (changes.token) settings.token = changes.token.newValue;
    }
  });

  // Initialize
  async function init() {
    await loadSettings();
    showMessage('cc-tmux-stream ready.');
    showMessage('Click "Connect" to start streaming.');

    if (!settings.token) {
      showMessage('');
      showMessage('Note: No token configured.', 'status');
      showMessage('Right-click the extension icon and select "Options" to configure.');
    }
  }

  init();
})();
