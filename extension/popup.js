// Popup script for OpportunityOS Browser Extension
// Handles live communication with active tab and submission to OpportunityOS backend.

document.addEventListener('DOMContentLoaded', async () => {
  const DEFAULT_APP_URL = 'http://localhost:3000';
  let appUrl = DEFAULT_APP_URL;

  // DOM elements
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const portalBadge = document.getElementById('portalBadge');
  const oppTitle = document.getElementById('oppTitle');
  const oppOrg = document.getElementById('oppOrg');
  const oppSnippet = document.getElementById('oppSnippet');
  const charCount = document.getElementById('charCount');
  const linkCount = document.getElementById('linkCount');
  const btnSave = document.getElementById('btnSave');
  const btnSaveText = document.getElementById('btnSaveText');
  const btnFullReview = document.getElementById('btnFullReview');
  const alertBox = document.getElementById('alertBox');
  const alertMsg = document.getElementById('alertMsg');
  const alertActions = document.getElementById('alertActions');

  let currentPayload = null;

  // 1. Check connection to OpportunityOS website
  async function checkAppHealth() {
    try {
      const res = await fetch(`${appUrl}/`, { method: 'GET', cache: 'no-store' });
      if (res.status === 200) {
        statusDot.className = 'status-dot online';
        statusText.textContent = 'App Online';
        return true;
      }
    } catch {
      // Failed
    }
    statusDot.className = 'status-dot offline';
    statusText.textContent = 'App Offline';
    return false;
  }

  // 2. Compute SHA-256 hash using native Web Crypto
  async function sha256Hex(text) {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  // 3. Display alerts
  function showAlert(msg, type = 'error', actionsHtml = '') {
    alertBox.className = `alert ${type}`;
    alertMsg.innerHTML = msg;
    alertActions.innerHTML = actionsHtml;
    alertBox.style.display = 'block';
  }

  function hideAlert() {
    alertBox.style.display = 'none';
  }

  // 4. Extract data from current active tab
  async function extractActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) {
      showAlert('No active tab detected.');
      return;
    }

    // Do not run on chrome:// or extension pages
    if (tab.url.startsWith('chrome://') || tab.url.startsWith('edge://') || tab.url.startsWith('chrome-extension://')) {
      portalBadge.textContent = 'Browser Internal';
      oppTitle.value = 'Cannot capture internal browser page';
      oppSnippet.textContent = 'Navigate to any job, internship, or hackathon page (e.g. LinkedIn, Internshala, Unstop) to capture.';
      btnSave.disabled = true;
      btnFullReview.disabled = true;
      return;
    }

    try {
      // Attempt message to existing content script
      let response = await chrome.tabs.sendMessage(tab.id, { action: 'extractOpportunity' }).catch(() => null);

      // If content script was not already loaded, inject it dynamically
      if (!response || !response.success) {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js']
        });
        response = await chrome.tabs.sendMessage(tab.id, { action: 'extractOpportunity' });
      }

      if (response && response.success && response.data) {
        currentPayload = response.data;
        populateUI(currentPayload);
      } else {
        throw new Error(response?.error || 'Could not extract page content.');
      }
    } catch (err) {
      console.warn('Extraction fallback:', err);
      // Fallback: extract basic page metadata
      currentPayload = {
        title: tab.title || 'Captured Opportunity',
        url: tab.url,
        organization: '',
        portal: 'Web',
        text: '',
        links: [],
        captured_at: new Date().toISOString()
      };
      populateUI(currentPayload);
      showAlert('Limited text extracted. Click "Open Full Review" to paste details manually.', 'error');
    }
  }

  function populateUI(data) {
    portalBadge.textContent = data.portal || 'Web';
    oppTitle.value = data.title || '';
    oppOrg.value = data.organization || '';
    oppSnippet.textContent = data.text ? data.text.slice(0, 300) + (data.text.length > 300 ? '...' : '') : 'No text content extracted.';
    charCount.textContent = `${(data.text || '').length} characters`;
    linkCount.textContent = `${(data.links || []).length} application links`;
  }

  // 5. Handle Direct Save
  btnSave.addEventListener('click', async () => {
    if (!currentPayload) return;
    hideAlert();

    const isOnline = await checkAppHealth();
    if (!isOnline) {
      showAlert(
        `<strong>OpportunityOS is not reachable at ${appUrl}.</strong><br>Start the app server (` +
        `<code>npm start</code> or <code>npm run dev</code>) and sign in.`,
        'error'
      );
      return;
    }

    btnSave.disabled = true;
    btnSaveText.innerHTML = '<span class="spinner"></span> Saving...';

    try {
      const finalTitle = oppTitle.value.trim() || currentPayload.title;
      const finalOrg = oppOrg.value.trim() || currentPayload.organization;
      const contentToSave = currentPayload.text || `${finalTitle} at ${finalOrg}\n${currentPayload.url}`;

      const requestId = crypto.randomUUID();
      const payloadHash = await sha256Hex(contentToSave);

      // Step A: Request Single-Use Capture Nonce
      const nonceRes = await fetch(`${appUrl}/api/capture/nonce`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          request_id: requestId,
          payload_hash: payloadHash
        })
      });

      if (nonceRes.status === 401) {
        showAlert(
          `Please sign in to OpportunityOS before saving opportunities.`,
          'error',
          `<button class="btn btn-secondary" id="btnSignIn" style="padding: 5px 10px; font-size: 11px;">Sign in now</button>`
        );
        document.getElementById('btnSignIn')?.addEventListener('click', () => {
          chrome.tabs.create({ url: `${appUrl}/login` });
        });
        return;
      }

      const nonceData = await nonceRes.json();
      if (!nonceRes.ok || !nonceData.nonce) {
        throw new Error(nonceData.error || 'Failed to obtain secure capture nonce.');
      }

      // Step B: Submit to Intake
      const intakePayload = {
        request_id: requestId,
        source_type: 'capture',
        content: contentToSave,
        payload_hash: payloadHash,
        nonce: nonceData.nonce,
        metadata: {
          title: finalTitle,
          organization: finalOrg,
          url: currentPayload.url,
          links: currentPayload.links || [],
          portal: currentPayload.portal,
          captured_at: new Date().toISOString(),
          source_type: 'extension'
        }
      };

      const intakeRes = await fetch(`${appUrl}/api/intake`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(intakePayload)
      });

      const intakeData = await intakeRes.json();
      if (!intakeRes.ok || intakeData.error) {
        throw new Error(intakeData.error || 'Intake failed to accept opportunity.');
      }

      // Success
      showAlert(
        `✓ <strong>Saved to OpportunityOS!</strong><br>Now awaiting AI evaluation in your inbox.`,
        'success',
        `<button class="btn btn-primary" id="btnOpenInbox" style="padding: 5px 12px; font-size: 11px;">View in Inbox</button>`
      );

      document.getElementById('btnOpenInbox')?.addEventListener('click', () => {
        chrome.tabs.create({ url: `${appUrl}/inbox` });
        window.close();
      });

    } catch (err) {
      showAlert(`Capture Error: ${err.message || String(err)}`, 'error');
    } finally {
      btnSave.disabled = false;
      btnSaveText.textContent = 'Save to OpportunityOS';
    }
  });

  // 6. Handle Full Review on Dashboard
  btnFullReview.addEventListener('click', async () => {
    if (!currentPayload) return;

    const finalTitle = oppTitle.value.trim() || currentPayload.title;
    const finalOrg = oppOrg.value.trim() || currentPayload.organization;

    const payloadToPass = {
      ...currentPayload,
      title: finalTitle,
      organization: finalOrg
    };

    const tab = await chrome.tabs.create({ url: `${appUrl}/capture?from=extension` });
    chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
      if (tabId === tab.id && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: (p) => {
            try {
              sessionStorage.setItem('opportunityos_extension_payload', JSON.stringify(p));
              window.dispatchEvent(new CustomEvent('opportunityos:extension_payload', { detail: p }));
            } catch (e) {
              console.warn(e);
            }
          },
          args: [payloadToPass]
        });
      }
    });
    window.close();
  });

  // Initial load
  await checkAppHealth();
  await extractActiveTab();
});
