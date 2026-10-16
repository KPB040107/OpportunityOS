// Content script for OpportunityOS Browser Extension
// Safely extracts opportunity text, canonical link, and platform metadata without reading private cookies or forms.

(function () {
  // Listen for extraction requests from popup or background
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'extractOpportunity') {
      try {
        const data = extractPageData();
        sendResponse({ success: true, data });
      } catch (err) {
        sendResponse({ success: false, error: err.message || String(err) });
      }
    }
    return true; // Keep message channel open for async response
  });

  function cleanTrackingUrl(rawUrl) {
    if (!rawUrl) return '';
    try {
      const u = new URL(rawUrl);
      const trackingParams = [
        'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
        'trk', 'trackingId', 'refId', 'midToken', 'trkEmail', 'ref', 'source',
        'fbclid', 'gclid', 'msclkid', 'mc_cid', 'mc_eid', '_ga'
      ];
      for (const p of trackingParams) {
        u.searchParams.delete(p);
      }
      return u.toString();
    } catch {
      return rawUrl;
    }
  }

  function detectPortal(url, text) {
    const lowerUrl = (url || '').toLowerCase();
    const lowerText = (text || '').toLowerCase();

    if (lowerUrl.includes('linkedin.com') || lowerText.includes('linkedin')) return 'LinkedIn';
    if (lowerUrl.includes('internshala.com') || lowerText.includes('internshala')) return 'Internshala';
    if (lowerUrl.includes('unstop.com') || lowerText.includes('unstop')) return 'Unstop';
    if (lowerUrl.includes('boards.greenhouse.io') || lowerUrl.includes('job-boards.greenhouse.io')) return 'Greenhouse';
    if (lowerUrl.includes('jobs.ashbyhq.com')) return 'Ashby';
    if (lowerUrl.includes('devpost.com')) return 'Devpost';
    if (lowerUrl.includes('lever.co')) return 'Lever';
    return 'Web';
  }

  function detectOrganization(title, url, portal) {
    // Check known portal patterns
    if (portal === 'LinkedIn') {
      // e.g., "Software Engineer - Google | LinkedIn"
      const match = title.match(/at\s+([A-Za-z0-9\s&.,-]+?)(?:\s+in\s+|\s*\||$)/i);
      if (match) return match[1].trim();
    }

    if (portal === 'Internshala') {
      // e.g., "Web Development Internship at Acme Corp"
      const match = title.match(/at\s+([A-Za-z0-9\s&.,-]+?)(?:\s+in\s+|\s*-\s*Internshala|$)/i);
      if (match) return match[1].trim();
    }

    // Try common separators in title: "Job Title - Company - Location" or "Job Title at Company"
    const atMatch = title.match(/(?:at|@)\s+([A-Za-z0-9\s&.,-]+?)(?:\s+[-|]\s+|$)/i);
    if (atMatch) return atMatch[1].trim();

    const parts = title.split(/\s*[-|–—]\s*/);
    if (parts.length >= 2) {
      const candidate = parts[1].replace(/(careers|jobs|internships|hiring|recruitment|portal).*/i, '').trim();
      if (candidate.length > 1 && candidate.length < 50) return candidate;
    }

    // Fallback: hostname
    try {
      const host = new URL(url).hostname.replace(/^www\./, '').split('.')[0];
      return host.charAt(0).toUpperCase() + host.slice(1);
    } catch {
      return '';
    }
  }

  function extractPageData() {
    // 1. Title
    let rawTitle = document.title || 'Captured Opportunity';
    // Clean site suffix
    const cleanTitle = rawTitle
      .replace(/\s*[-|–—]\s*(LinkedIn|Internshala|Unstop|Greenhouse|Lever|Ashby|Devpost).*$/i, '')
      .trim();

    // 2. URL
    const canonicalEl = document.querySelector('link[rel="canonical"]');
    const rawUrl = (canonicalEl && canonicalEl.href) || window.location.href;
    const cleanUrl = cleanTrackingUrl(rawUrl);

    // 3. Text content
    // Prioritize active selection
    const selection = window.getSelection ? window.getSelection().toString().trim() : '';
    let extractedText = selection;

    // If no text was manually selected, find the primary job content container
    if (!extractedText) {
      const selectors = [
        'main',
        'article',
        '[role="main"]',
        '#job-details',
        '.job-details',
        '.job-description',
        '.description',
        '.posting-requirements',
        '.internship_details',
        '#internship_details',
        '.opportunity-details',
        '.content-body'
      ];

      let container = null;
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el && el.innerText && el.innerText.trim().length > 100) {
          container = el;
          break;
        }
      }

      if (!container) {
        container = document.body;
      }

      // Clone container to sanitize
      const clone = container.cloneNode(true);
      // Remove scripts, styles, forms, navigation, headers, footers
      const unwanted = clone.querySelectorAll('script, style, noscript, nav, header, footer, form, iframe, svg, [role="navigation"]');
      unwanted.forEach(el => el.remove());

      extractedText = clone.innerText || '';
    }

    // Limit to 19,500 characters
    extractedText = extractedText.trim().slice(0, 19500);

    // 4. Portal & Organization detection
    const portal = detectPortal(cleanUrl, extractedText);
    const organization = detectOrganization(cleanTitle, cleanUrl, portal);

    // 5. Gather relevant links (Application URLs, external company links)
    const links = [];
    const seenUrls = new Set();
    const linkEls = document.querySelectorAll('a[href]');

    for (const a of linkEls) {
      if (links.length >= 15) break;
      const href = a.href;
      if (!href) continue;

      // Filter out internal anchors, javascript, mailto
      if (href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:') || href.includes('#')) {
        continue;
      }

      const linkText = (a.innerText || a.getAttribute('aria-label') || '').trim();
      const cleanedHref = cleanTrackingUrl(href);

      if (!seenUrls.has(cleanedHref) && (linkText || /apply|register|view|company|careers/i.test(cleanedHref))) {
        seenUrls.add(cleanedHref);
        links.push({
          text: linkText.slice(0, 80) || 'Application Link',
          url: cleanedHref
        });
      }
    }

    return {
      title: cleanTitle,
      url: cleanUrl,
      organization,
      portal,
      text: extractedText,
      links,
      captured_at: new Date().toISOString()
    };
  }
})();
