// Deterministic Capture and Alert Parsing Contract for Slice S4
import { createHash } from 'node:crypto';

// Known marketing and tracking query parameters to cleanly strip
const TRACKING_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id',
  'trk', 'trackingid', 'ref', 'refid', 'ref_id', 'fbclid', 'gclid', 'msclkid',
  'mc_cid', 'mc_eid', 'li_fat_id', 'originalsubdomain', 'source', 'campaign',
  '_hsenc', '_hsmi', 'mkt_tok'
]);

// Known pure redirector hosts that should be rejected if no destination is identifiable
const REDIRECTOR_HOSTS = new Set([
  'clk.linkedin.com', 'click.email.linkedin.com', 'redirect.unstop.com', 'mandrillapp.com', 'sendgrid.net'
]);

export function cleanTrackingUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  try {
    const parsed = new URL(rawUrl.trim());
    if (!['http:', 'https:'].includes(parsed.protocol)) return '';

    // Check for nested destination redirect parameters
    for (const param of ['url', 'dest', 'destination', 'target', 'redirect']) {
      const target = parsed.searchParams.get(param);
      if (target && (target.startsWith('http://') || target.startsWith('https://'))) {
        return cleanTrackingUrl(target);
      }
    }

    const host = parsed.hostname.toLowerCase();
    const REDIRECTORS = ['clk.linkedin.com', 'click.email.linkedin.com', 'redirect.unstop.com', 'mandrillapp.com', 'sendgrid.net'];
    if (REDIRECTORS.includes(host) && !parsed.pathname.includes('/jobs/') && !parsed.pathname.includes('/internship/')) {
      return '';
    }

    const TRACKING = [
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id',
      'trk', 'trackingid', 'ref', 'refid', 'ref_id', 'fbclid', 'gclid', 'msclkid',
      'mc_cid', 'mc_eid', 'li_fat_id', 'originalsubdomain', 'source', 'campaign',
      '_hsenc', '_hsmi', 'mkt_tok'
    ];

    // Clean search params
    const keysToDelete = [];
    for (const [key] of parsed.searchParams.entries()) {
      const lowerKey = key.toLowerCase();
      if (TRACKING.includes(lowerKey) || lowerKey.startsWith('utm_')) {
        keysToDelete.push(key);
      }
    }
    for (const key of keysToDelete) {
      parsed.searchParams.delete(key);
    }

    // Clean trailing hash/fragment
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return '';
  }
}

export function detectPortal(urlOrText = '') {
  const lower = String(urlOrText || '').toLowerCase();
  if (lower.includes('linkedin.com')) return 'linkedin';
  if (lower.includes('unstop.com')) return 'unstop';
  if (lower.includes('internshala.com')) return 'internshala';
  return 'web';
}

export function deterministicUUID(seed) {
  let h1 = 0xdeadbeef, h2 = 0x41c64e6d, h3 = 0x12345678, h4 = 0x87654321;
  const str = String(seed);
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
    h3 = Math.imul(h3 ^ ch, 3812015801);
    h4 = Math.imul(h4 ^ ch, 2718281829);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h3 ^ (h3 >>> 13), 3266489909);
  h3 = Math.imul(h3 ^ (h3 >>> 16), 2246822507) ^ Math.imul(h4 ^ (h4 >>> 13), 3266489909);
  h4 = Math.imul(h4 ^ (h4 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const toHex = n => (n >>> 0).toString(16).padStart(8, '0');
  const hex = toHex(h1) + toHex(h2) + toHex(h3) + toHex(h4);
  return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-5' + hex.slice(13, 16) + '-a' + hex.slice(17, 20) + '-' + hex.slice(20, 32);
}

export function validateCapturePayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('INVALID_PAYLOAD: Expected non-null object');
  }

  const title = String(payload.title || '').trim().slice(0, 300);
  if (!title) {
    throw new Error('INVALID_TITLE: Title is required and cannot be empty');
  }

  const rawUrl = String(payload.url || '').trim();
  const cleanedUrl = cleanTrackingUrl(rawUrl);
  if (!cleanedUrl) {
    throw new Error('INVALID_URL: Must provide a valid public HTTP/HTTPS URL');
  }

  const rawText = String(payload.text || '').trim();
  if (!rawText) {
    throw new Error('INVALID_CONTENT: Captured text is required');
  }
  if (rawText.length > 20000) {
    throw new Error('PAYLOAD_TOO_LARGE: Captured text exceeds 20,000 character limit');
  }

  // Reject suspicious fields containing credentials, cookies, or script blocks
  const lower = rawText.toLowerCase();
  if (lower.includes('<script') || lower.includes('document.cookie') || lower.includes('authorization: bearer')) {
    throw new Error('SECURITY_VIOLATION: Script tags, cookies, or auth headers detected');
  }

  // Process optional links array (max 20)
  const links = [];
  if (Array.isArray(payload.links)) {
    for (const item of payload.links.slice(0, 20)) {
      if (item && typeof item === 'object') {
        const itemUrl = cleanTrackingUrl(String(item.url || ''));
        if (itemUrl) {
          links.push({
            text: String(item.text || '').trim().slice(0, 150),
            url: itemUrl
          });
        }
      }
    }
  }

  const portal = detectPortal(cleanedUrl);
  const contentHash = createHash('sha256').update(rawText).digest('hex');

  return {
    title,
    url: cleanedUrl,
    text: rawText,
    portal,
    links,
    content_hash: contentHash,
    captured_at: payload.captured_at ? new Date(payload.captured_at).toISOString() : new Date().toISOString()
  };
}

// Parses multi-listing email alerts (LinkedIn, Unstop, Internshala) into discrete candidates
export function parseMultiListingAlert(text = '', fromAddress = '', parentRequestId = '') {
  function initcap(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  }

  const content = String(text || '').trim();
  if (!content) return [];

  const portal = detectPortal(fromAddress + ' ' + content);
  const candidates = [];

  // Match platform-specific opportunity URLs
  const urlRegex = portal === 'linkedin'
    ? /https:\/\/[a-z.]*linkedin\.com\/(?:comm\/)?jobs\/view\/[0-9]+/gi
    : portal === 'internshala'
    ? /https:\/\/internshala\.com\/internship\/detail\/[^\s"')]+/gi
    : portal === 'unstop'
    ? /https:\/\/unstop\.com\/(?:competitions|hackathons|internships|jobs|workshops)\/[^\s"')]+/gi
    : /https?:\/\/[^\s"')]+/gi;

  const matches = [...content.matchAll(urlRegex)];

  if (matches.length > 0) {
    // Isolate discrete candidate blocks with strong boundaries
    const seenUrls = new Set();
    const validMatches = [];
    for (const m of matches) {
      const cleanUrl = cleanTrackingUrl(m[0]);
      if (cleanUrl && !seenUrls.has(cleanUrl)) {
        seenUrls.add(cleanUrl);
        validMatches.push({ match: m, cleanUrl });
      }
    }

    const candidateBlocks = [];

    for (let i = 0; i < validMatches.length; i++) {
      const { match, cleanUrl } = validMatches[i];

      // Boundary:
      // Item starts after previous item's URL (or index 0 for first item)
      let startIdx = 0;
      if (i > 0) {
        const prevMatch = validMatches[i - 1].match;
        const prevEnd = prevMatch.index + prevMatch[0].length;
        const between = content.slice(prevEnd, match.index);
        const blankLineIdx = between.indexOf('\n\n');
        if (blankLineIdx !== -1) {
          startIdx = prevEnd + blankLineIdx + 2;
        } else {
          startIdx = prevEnd;
        }
      }

      // Item ends at this item's URL end
      let endIdx = match.index + match[0].length;
      if (i + 1 < validMatches.length) {
        const nextMatch = validMatches[i + 1].match;
        const between = content.slice(endIdx, nextMatch.index);
        const blankLineIdx = between.indexOf('\n\n');
        if (blankLineIdx !== -1) {
          endIdx += blankLineIdx;
        }
      }

      let rawSegment = content.slice(startIdx, endIdx).trim();

      // Clean leading email intro noise from first block
      if (i === 0) {
        rawSegment = rawSegment.replace(/^(?:your\s+daily\s+)?(?:job|opportunity|internship)\s+alert[^:\n]*:\s*/i, '').trim();
      }

      // Check minimum necessary facts
      const roleMatch = rawSegment.match(/(?:role|title|position|profile):\s*([^\n\r]+)/i);
      const atMatch = rawSegment.match(/([A-Z0-9][A-Za-z0-9\s/+-]{2,60})\s+(?:at|@|organized by|hosted by)\s+([A-Za-z0-9\s.,&-]{2,60})/i);

      let title = '';
      let organization = '';

      if (roleMatch) {
        title = roleMatch[1].trim();
        const roleAtMatch = title.match(/(.+?)\s+(?:at|@)\s+(.+)/i);
        if (roleAtMatch) {
          organization = roleAtMatch[2].trim();
        }
      } else if (atMatch) {
        title = atMatch[1].trim();
        organization = atMatch[2].trim();
      } else {
        const cleanLines = rawSegment
          .split('\n')
          .map(l => l.trim())
          .filter(l => l && !l.includes('http') && !l.toLowerCase().includes('alert for') && !l.toLowerCase().includes('alert:') && !l.toLowerCase().includes('view job'));
        title = cleanLines[0] ? cleanLines[0].slice(0, 100) : '';
      }

      // If no valid title or role could be determined, reject this block
      if (!title || title.length < 2) {
        continue;
      }

      if (!organization && atMatch) {
        organization = atMatch[2].trim();
      }
      if (!organization) {
        organization = portal !== 'web' ? `${initcap(portal)} Employer` : 'Opportunity Provider';
      }

      const isHackathon = /\b(?:hackathon|hackathons|competition|competitions|challenge|challenges|ideathon)\b/i.test(rawSegment) || cleanUrl.includes('/hackathons/') || cleanUrl.includes('/competitions/');
      const isIntern = /\b(?:intern|internship|internships|trainee)\b/i.test(rawSegment) || cleanUrl.includes('/internship') || cleanUrl.includes('/internships/');
      const type = isHackathon ? 'hackathon' : isIntern ? 'internship' : 'job';

      candidateBlocks.push({
        title,
        organization,
        type,
        application_url: cleanUrl,
        portal,
        text: rawSegment.slice(0, 2000)
      });
    }

    // Cap at 10 candidates per alert
    const capped = candidateBlocks.slice(0, 10);
    for (let idx = 0; idx < capped.length; idx++) {
      const cand = capped[idx];
      let candReqId = '';
      if (parentRequestId) {
        candReqId = (capped.length === 1 && idx === 0)
          ? parentRequestId
          : deterministicUUID(parentRequestId + ':listing:' + idx);
      }
      candidates.push({
        ...cand,
        candidate_index: idx,
        ...(candReqId ? { request_id: candReqId } : {})
      });
    }
  }

  // Fallback: If no discrete blocks were identified, return single alert entry
  if (candidates.length === 0) {
    const genericLink = content.match(/https?:\/\/[^\s"')]+/i);
    const cleanGeneric = genericLink ? cleanTrackingUrl(genericLink[0]) : '';
    const isHackathon = /\b(?:hackathon)\b/i.test(content);
    const isIntern = /\b(?:intern|internship)\b/i.test(content);

    candidates.push({
      title: 'Forwarded Opportunity Alert',
      organization: portal !== 'web' ? initcap(portal) : 'Opportunity Provider',
      type: isHackathon ? 'hackathon' : isIntern ? 'internship' : 'job',
      application_url: cleanGeneric,
      portal,
      candidate_index: 0,
      text: content.slice(0, 2000),
      ...(parentRequestId ? { request_id: parentRequestId } : {})
    });
  }

  return candidates;
}
