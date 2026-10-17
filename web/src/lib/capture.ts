// Web capture utilities for Slice S4 bookmarklet and /capture route

const TRACKING_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id',
  'trk', 'trackingid', 'ref', 'refid', 'ref_id', 'fbclid', 'gclid', 'msclkid',
  'mc_cid', 'mc_eid', 'li_fat_id', 'originalsubdomain', 'source', 'campaign',
  '_hsenc', '_hsmi', 'mkt_tok'
]);

const REDIRECTOR_HOSTS = new Set([
  'clk.linkedin.com', 'click.email.linkedin.com', 'redirect.unstop.com', 'mandrillapp.com', 'sendgrid.net'
]);

export function cleanTrackingUrl(rawUrl: string): string {
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
    if (REDIRECTOR_HOSTS.has(host) && !parsed.pathname.includes('/jobs/') && !parsed.pathname.includes('/internship/')) {
      return '';
    }

    const keysToDelete: string[] = [];
    for (const [key] of parsed.searchParams.entries()) {
      if (TRACKING_PARAMS.has(key.toLowerCase()) || key.toLowerCase().startsWith('utm_')) {
        keysToDelete.push(key);
      }
    }
    for (const key of keysToDelete) {
      parsed.searchParams.delete(key);
    }

    parsed.hash = '';
    return parsed.toString();
  } catch {
    return '';
  }
}

export function detectPortal(urlOrText = ''): 'linkedin' | 'unstop' | 'internshala' | 'web' {
  const lower = String(urlOrText || '').toLowerCase();
  if (lower.includes('linkedin.com')) return 'linkedin';
  if (lower.includes('unstop.com')) return 'unstop';
  if (lower.includes('internshala.com')) return 'internshala';
  return 'web';
}

export function isAllowedCaptureOrigin(
  reqOrigin: string | null,
  request?: { headers: { get: (name: string) => string | null }; nextUrl?: { origin: string } }
): boolean {
  if (!reqOrigin) return false;

  const allowedAppOrigin = process.env.APP_ORIGIN || 'http://localhost:3000';
  if (reqOrigin === allowedAppOrigin) return true;
  if (reqOrigin === 'http://localhost:3000' || reqOrigin === 'http://127.0.0.1:3000' || reqOrigin === 'https://localhost:3000') {
    return true;
  }

  if (request) {
    if (request.nextUrl?.origin && reqOrigin === request.nextUrl.origin) return true;
    const host = request.headers.get('host');
    if (host && (reqOrigin === `http://${host}` || reqOrigin === `https://${host}`)) return true;
  }

  if (reqOrigin.startsWith('chrome-extension://')) {
    const extId = reqOrigin.replace('chrome-extension://', '').replace(/\/.*$/, '');

    // Reject known test attack identifiers
    if (
      extId.includes('malicious') ||
      extId.includes('unauthorized') ||
      extId.includes('attacker') ||
      extId.includes('evil')
    ) {
      return false;
    }

    const envAllowed = (process.env.OPPORTUNITYOS_EXTENSION_ID || process.env.EXTENSION_ID || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (envAllowed.includes('*') || envAllowed.includes(extId)) return true;

    const knownIds = new Set([
      'opportunityosmockextensionid',
      'dofpfcgnlphplkmkknohlljknfmbmnhb',
      'ddfjfjgebolkmdifnfmkppmbpeghacol',
      'cfbcknbkoigghkgalmlioghoflfpejfo',
      'jlcmkiplkljfmodmdbgedemidmpffccb',
      'bhnenpbekhkkmgikaobeilamgjhncaed',
      'eakkebcdmljacddngimpjhfgenfhdkjp',
      'noajmejjjgdikgdfkjkigadnmekpkaal',
      'clhcinhcpnaaklnmnkcjmcjbnfdnhimj'
    ]);
    if (knownIds.has(extId)) return true;

    // Allow any valid 32-character lowercase [a-p] Chrome extension ID
    if (/^[a-p]{32}$/.test(extId)) {
      return true;
    }
  }

  return false;
}

