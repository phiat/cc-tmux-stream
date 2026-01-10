// Background script for tmux Stream
// Currently minimal - can be extended for persistent connections

browser.runtime.onInstalled.addListener(() => {
  console.log('cc-tmux-stream extension installed');

  // Set default settings if not present
  browser.storage.local.get(['serverUrl']).then((result) => {
    if (!result.serverUrl) {
      browser.storage.local.set({
        serverUrl: 'ws://127.0.0.1:19475'
      });
    }
  });
});
