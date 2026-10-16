// Background Service Worker for OpportunityOS Browser Extension (Manifest V3)

chrome.runtime.onInstalled.addListener(() => {
  // Create context menu for 1-click capture
  chrome.contextMenus.create({
    id: 'opportunityos-save',
    title: 'Save to OpportunityOS',
    contexts: ['page', 'selection', 'link']
  });
  console.log('OpportunityOS extension installed successfully.');
});

// Context menu click handler
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'opportunityos-save' && tab && tab.id) {
    try {
      // In Manifest V3, we can open the action popup or capture tab
      const appUrl = 'http://localhost:3000';
      chrome.tabs.create({ url: `${appUrl}/capture?from=context-menu` });
    } catch (err) {
      console.error('Failed to trigger capture from context menu:', err);
    }
  }
});
