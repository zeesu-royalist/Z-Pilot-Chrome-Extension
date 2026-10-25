/**
 * Z-Pilot Background Service Worker
 * Manages Side Panel behavior, tab lifecycle, and extension actions.
 */

// Configure the side panel to open on action button click
chrome.runtime.onInstalled.addListener(() => {
  console.log('[Z-Pilot] Extension installed / updated.');

  // Set side panel behavior to open on action click where supported
  if (chrome.sidePanel && 'setPanelBehavior' in chrome.sidePanel) {
    chrome.sidePanel
      .setPanelBehavior({ openPanelOnActionClick: true })
      .catch((err) => {
        console.warn('[Z-Pilot] Could not set sidePanel behavior:', err);
      });
  }
});

// Fallback click handler if setPanelBehavior is not available
chrome.action.onClicked.addListener(async (tab) => {
  if (chrome.sidePanel && 'open' in chrome.sidePanel && tab.windowId) {
    try {
      await chrome.sidePanel.open({ windowId: tab.windowId });
    } catch (err) {
      console.warn('[Z-Pilot] Error opening side panel on click:', err);
    }
  }
});

// Broadcast active tab updates or handle background execution if needed
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab && tab.url) {
      // Optional: notify open side panels of active tab change
      chrome.runtime.sendMessage({
        type: 'ACTIVE_TAB_CHANGED',
        tabId: tab.id,
        url: tab.url,
        title: tab.title,
      }).catch(() => {
        // Suppress errors when side panel is closed
      });
    }
  } catch {
    // Tab might have been closed immediately
  }
});
