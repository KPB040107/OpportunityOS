import { requireUser } from '@/lib/auth';
import { Card } from '@/components/ui/card';
import { formatDate } from '@/lib/utils';
import { ToggleButton } from './toggle-button';
import { SeedPresetsButton } from './seed-button';
import { addCustomSource } from './actions';
import { setSourcePreferenceAction } from '../inbox/actions';
import {
  Globe,
  ArrowUpRight,
  Rss,
  Mail,
  PlusCircle,
  CheckCircle2,
  AlertCircle,
  Clock,
  Volume2,
  VolumeX,
  ShieldCheck,
  Building2,
  Trophy,
  SearchCode
} from 'lucide-react';
import type { Source } from '@/lib/types';
import { publicUrl } from '@/lib/validation';
import { BookmarkletCard } from '@/components/bookmarklet-card';
import { ExtensionSetupCard } from '@/components/extension-setup-card';
import { PortalSetupCard } from '@/components/portal-setup-card';

export default async function SourcesPage({ searchParams }: { searchParams?: Promise<{ error?: string; success?: string }> } = {}) {
  const params = searchParams ? await searchParams : {};
  const { supabase, user } = await requireUser();

  const [sourcesResult, discoveryResult, profileResult, prefsResult] = await Promise.all([
    supabase
      .from('sources')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true }),
    supabase.rpc('get_discovery_sources'),
    supabase.from('profiles').select('email_alias_token, verified_portals, forwarding_received').eq('user_id', user.id).maybeSingle(),
    supabase.from('user_source_preferences').select('source_identifier, preference').eq('user_id', user.id)
  ]);

  if (sourcesResult.error) {
    throw new Error('Sources data unavailable');
  }

  const sources = (sourcesResult.data || []) as Source[];
  const discoverySources = (discoveryResult.data || []) as Array<{
    id: string;
    name: string;
    adapter: string;
    source_kind: string;
    status: string;
    last_scan: string | null;
    item_count: number;
  }>;
  const profile = profileResult.data;

  // Map user source preferences (muted / normal)
  const sourcePrefs: Record<string, string> = {};
  for (const pref of (prefsResult.data || [])) {
    if (pref.source_identifier) {
      sourcePrefs[pref.source_identifier.toLowerCase()] = pref.preference;
    }
  }

  // Group connected sources (S-03)
  const companyFeeds = discoverySources.filter(
    (ds) => ds.adapter === 'lever-v1' || ds.adapter === 'greenhouse-v1' || ds.adapter === 'ashby-v1'
  );
  const hackathonRegistries = discoverySources.filter((ds) => ds.adapter === 'devpost-v1');
  const searchFeeds = discoverySources.filter((ds) => ds.adapter === 'jsearch-v1');

  const totalItemsDiscovered = discoverySources.reduce((acc, ds) => acc + (ds.item_count || 0), 0);
  const mutedCount = Object.values(sourcePrefs).filter((p) => p === 'muted').length;

  const sourceLink = (url: string) => {
    try {
      return publicUrl(url);
    } catch {
      return undefined;
    }
  };

  async function toggleSourcePreference(formData: FormData) {
    'use server';
    const source = formData.get('source') as string;
    const pref = (formData.get('preference') || 'normal') as 'normal' | 'muted';
    await setSourcePreferenceAction(source, pref);
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Opportunity Sources & Feeds</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage connected company boards, hackathon registries, search integrations, and personal forwarding aliases.
          </p>
        </div>
        <SeedPresetsButton />
      </div>

      {/* S-03 Overview Stats Bar */}
      <div className="grid gap-3 sm:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Autonomous Feeds</p>
          <p className="mt-1 text-2xl font-bold text-foreground">{discoverySources.length}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">Zero-auth schedule</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Items Discovered</p>
          <p className="mt-1 text-2xl font-bold text-primary">{totalItemsDiscovered}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">Total catalog entries</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Custom Links</p>
          <p className="mt-1 text-2xl font-bold text-foreground">{sources.length}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">Personal portals & RSS</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Source Controls</p>
          <p className="mt-1 text-2xl font-bold text-foreground">{mutedCount} Muted</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">Active follow/mute rules</p>
        </Card>
      </div>

      {/* Group 1: Verified Company ATS Feeds (S-03) */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Building2 className="size-5 text-primary" />
              Connected Company ATS Feeds
            </h2>
            <p className="text-xs text-muted-foreground">
              Official company career boards with direct public endpoints. Opportunities enter as Corroborated Tier.
            </p>
          </div>
          <span className="rounded-full bg-act text-act-foreground border border-border px-2.5 py-0.5 text-xs font-semibold">
            {companyFeeds.length} Active Feeds
          </span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {companyFeeds.map((ds) => {
            const isMuted = sourcePrefs[ds.name.toLowerCase()] === 'muted';
            const isActive = ds.status === 'active';
            return (
              <Card key={ds.id} className="p-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                      <ShieldCheck className="size-3.5 text-primary" />
                      Corroborated · {ds.source_kind.replace('_', ' ')}
                    </span>
                    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-mono border border-border bg-act text-act-foreground">
                      {ds.adapter}
                    </span>
                  </div>
                  <h3 className="mt-2 text-base font-semibold text-foreground flex items-center gap-2">
                    {ds.name}
                    {isMuted && (
                      <span className="rounded bg-red-100 text-red-800 text-[10px] px-1.5 py-0.5 font-medium">
                        Muted
                      </span>
                    )}
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground font-mono">
                    Endpoint: {ds.adapter.split('-')[0]} API
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <span className={`size-1.5 rounded-full ${isActive ? 'bg-primary' : 'bg-muted-foreground'}`} />
                    <span>{ds.last_scan ? `Scanned ${formatDate(ds.last_scan)}` : 'Scheduled discovery active'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground">{ds.item_count} items</span>
                    <form action={toggleSourcePreference}>
                      <input type="hidden" name="source" value={ds.name} />
                      <input type="hidden" name="preference" value={isMuted ? 'normal' : 'muted'} />
                      <button
                        type="submit"
                        className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium border transition-colors ${
                          isMuted
                            ? 'bg-act text-act-foreground border-border hover:opacity-90'
                            : 'bg-muted text-muted-foreground border-border hover:text-foreground'
                        }`}
                        title={isMuted ? 'Unmute this source' : 'Mute opportunities from this source'}
                      >
                        {isMuted ? (
                          <>
                            <Volume2 className="size-3 text-act-foreground" />
                            Unmute
                          </>
                        ) : (
                          <>
                            <VolumeX className="size-3 text-red-500" />
                            Mute
                          </>
                        )}
                      </button>
                    </form>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Group 2: Hackathon Registries (S-03) */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Trophy className="size-5 text-blue-600" />
              Connected Hackathon & Competition Registries
            </h2>
            <p className="text-xs text-muted-foreground">
              Public student hackathon feeds. Ingested as Attributed Tier with structured participation requirements.
            </p>
          </div>
          <span className="rounded-full bg-blue-50 text-blue-800 border border-blue-200 px-2.5 py-0.5 text-xs font-semibold">
            {hackathonRegistries.length} Registries
          </span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {hackathonRegistries.map((ds) => {
            const isMuted = sourcePrefs[ds.name.toLowerCase()] === 'muted';
            const isActive = ds.status === 'active';
            return (
              <Card key={ds.id} className="p-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                      <Globe className="size-3.5 text-blue-600" />
                      Attributed · {ds.source_kind.replace('_', ' ')}
                    </span>
                    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-mono border bg-blue-50 text-blue-800 border-blue-200">
                      {ds.adapter}
                    </span>
                  </div>
                  <h3 className="mt-2 text-base font-semibold text-foreground flex items-center gap-2">
                    {ds.name}
                    {isMuted && (
                      <span className="rounded bg-red-100 text-red-800 text-[10px] px-1.5 py-0.5 font-medium">
                        Muted
                      </span>
                    )}
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Public registry feed: api.devpost.com
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <span className={`size-1.5 rounded-full ${isActive ? 'bg-primary' : 'bg-muted-foreground'}`} />
                    <span>{ds.last_scan ? `Scanned ${formatDate(ds.last_scan)}` : 'Scheduled discovery active'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground">{ds.item_count} hackathons</span>
                    <form action={toggleSourcePreference}>
                      <input type="hidden" name="source" value={ds.name} />
                      <input type="hidden" name="preference" value={isMuted ? 'normal' : 'muted'} />
                      <button
                        type="submit"
                        className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium border transition-colors ${
                          isMuted
                            ? 'bg-blue-50 text-blue-800 border-blue-300 hover:bg-blue-100'
                            : 'bg-muted text-muted-foreground border-border hover:text-foreground'
                        }`}
                        title={isMuted ? 'Unmute this source' : 'Mute hackathons from this source'}
                      >
                        {isMuted ? (
                          <>
                            <Volume2 className="size-3 text-blue-600" />
                            Unmute
                          </>
                        ) : (
                          <>
                            <VolumeX className="size-3 text-red-500" />
                            Mute
                          </>
                        )}
                      </button>
                    </form>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Group 3: Search APIs & Regional Aggregators (S-03) */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <SearchCode className="size-5 text-purple-600" />
              Connected Search & Aggregators
            </h2>
            <p className="text-xs text-muted-foreground">
              Curated queries targeting software and tech internships across India.
            </p>
          </div>
          <span className="rounded-full bg-purple-50 text-purple-800 border border-purple-200 px-2.5 py-0.5 text-xs font-semibold">
            {searchFeeds.length} Providers
          </span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {searchFeeds.map((ds) => {
            const isMuted = sourcePrefs[ds.name.toLowerCase()] === 'muted';
            const isActive = ds.status === 'active';
            return (
              <Card key={ds.id} className="p-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                      <Globe className="size-3.5 text-purple-600" />
                      Attributed · {ds.source_kind.replace('_', ' ')}
                    </span>
                    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-mono border bg-purple-50 text-purple-800 border-purple-200">
                      {ds.adapter}
                    </span>
                  </div>
                  <h3 className="mt-2 text-base font-semibold text-foreground flex items-center gap-2">
                    {ds.name}
                    {isMuted && (
                      <span className="rounded bg-red-100 text-red-800 text-[10px] px-1.5 py-0.5 font-medium">
                        Muted
                      </span>
                    )}
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Query: India Software Engineering Internships
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <span className={`size-1.5 rounded-full ${isActive ? 'bg-primary' : 'bg-muted-foreground'}`} />
                    <span>{ds.last_scan ? `Scanned ${formatDate(ds.last_scan)}` : 'Scheduled discovery active'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground">{ds.item_count} items</span>
                    <form action={toggleSourcePreference}>
                      <input type="hidden" name="source" value={ds.name} />
                      <input type="hidden" name="preference" value={isMuted ? 'normal' : 'muted'} />
                      <button
                        type="submit"
                        className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium border transition-colors ${
                          isMuted
                            ? 'bg-purple-50 text-purple-800 border-purple-300 hover:bg-purple-100'
                            : 'bg-muted text-muted-foreground border-border hover:text-foreground'
                        }`}
                        title={isMuted ? 'Unmute this source' : 'Mute opportunities from this source'}
                      >
                        {isMuted ? (
                          <>
                            <Volume2 className="size-3 text-purple-600" />
                            Unmute
                          </>
                        ) : (
                          <>
                            <VolumeX className="size-3 text-red-500" />
                            Mute
                          </>
                        )}
                      </button>
                    </form>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      {/* 1-Click Browser Extension */}
      <ExtensionSetupCard />

      {/* Alternative Zero-Install Bookmarklet Capture */}
      <BookmarkletCard appOrigin={process.env.APP_ORIGIN || 'http://localhost:3000'} />

      {/* Guided Portal Alert-Email Forwarding */}
      <PortalSetupCard
        aliasToken={profile?.email_alias_token || null}
        verifiedPortals={(profile?.verified_portals as string[]) || []}
        forwardingReceived={Boolean(profile?.forwarding_received)}
      />

      {sources.length === 0 ? (
        <Card className="p-10 text-center">
          <Globe className="mx-auto size-10 text-muted-foreground/60" />
          <h2 className="mt-4 text-base font-semibold">No sources configured yet</h2>
          <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
            Save the presets for internships, scholarships and hackathons, or add useful links below.
          </p>
          <div className="mt-6">
            <SeedPresetsButton />
          </div>
        </Card>
      ) : (
        <div className="grid gap-4">
          {sources.map((src) => {
            const isOk = src.last_status === 'ok';
            const isError = src.last_status === 'error';
            return (
              <Card key={src.id} className="p-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                        {src.type === 'rss' ? (
                          <Rss className="size-3.5 text-foreground" />
                        ) : src.type === 'email_forward' ? (
                          <Mail className="size-3.5 text-blue-600" />
                        ) : (
                          <Globe className="size-3.5 text-foreground" />
                        )}
                        {src.type}
                      </span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground capitalize">
                        {src.frequency}
                      </span>
                      {src.last_status && (
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                            isOk
                              ? 'bg-act text-act-foreground border border-border'
                              : isError
                              ? 'bg-danger text-danger-foreground border border-border'
                              : 'bg-ask text-ask-foreground border border-border'
                          }`}
                        >
                          {isOk ? (
                            <CheckCircle2 className="size-3" />
                          ) : isError ? (
                            <AlertCircle className="size-3" />
                          ) : (
                            <Clock className="size-3" />
                          )}
                          {src.last_status}
                        </span>
                      )}
                    </div>
                    <h2 className="text-lg font-semibold">{src.name}</h2>
                    <a
                      href={sourceLink(src.url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1 truncate max-w-lg"
                    >
                      {src.url}
                      <ArrowUpRight className="size-3" />
                    </a>
                  </div>
                  <div className="flex flex-col sm:items-end gap-2">
                    <ToggleButton id={src.id} enabled={src.enabled} />
                    <span className="text-xs text-muted-foreground">
                      {src.last_scan_at ? `Last scan: ${formatDate(src.last_scan_at)}` : 'Saved link · scheduled scanning not enabled'}
                    </span>
                  </div>
                </div>

                {src.keywords && src.keywords.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-border flex flex-wrap items-center gap-1.5 text-xs">
                    <span className="text-muted-foreground text-[11px]">Keywords:</span>
                    {src.keywords.map((kw) => (
                      <span key={kw} className="rounded bg-muted px-2 py-0.5 text-[11px] font-mono text-foreground">
                        {kw}
                      </span>
                    ))}
                    {src.item_count > 0 && (
                      <span className="ml-auto text-xs text-muted-foreground">
                        {src.item_count} items extracted
                      </span>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Add Custom Source Card */}
      <Card className="p-6 bg-muted/20">
        <h3 className="text-base font-semibold flex items-center gap-2">
          <PlusCircle className="size-4 text-primary" />
          Save a source link
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Save a public page or feed link. Use URL intake to analyse an announcement; saving a link does not start a scan.
        </p>

        {params.error && (
          <div role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
            {params.error}
          </div>
        )}
        {params.success && (
          <div role="status" className="mt-3 rounded-lg border border-border bg-act p-3 text-xs text-act-foreground font-semibold">
            {params.success}
          </div>
        )}

        <form action={addCustomSource} className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor="source-name" className="text-xs font-medium text-foreground">
              Source Name
            </label>
            <input
              id="source-name"
              name="name"
              required
              placeholder="e.g. My College Placement Cell"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="source-url" className="text-xs font-medium text-foreground">
              URL or Feed Endpoint
            </label>
            <input
              id="source-url"
              name="url"
              type="url"
              required
              placeholder="https://example.com/careers"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="source-type" className="text-xs font-medium text-foreground">
              Source Type
            </label>
            <select
              id="source-type"
              name="type"
              defaultValue="page"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="page">Public Static Web Page</option>
              <option value="rss">RSS / Atom Feed</option>
            </select>
          </div>

          <div className="space-y-1">
            <label htmlFor="source-frequency" className="text-xs font-medium text-foreground">
              Scan Frequency
            </label>
            <select
              id="source-frequency"
              name="frequency"
              defaultValue="daily"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="hourly">Hourly</option>
              <option value="6hours">Every 6 Hours</option>
              <option value="daily">Daily (Default)</option>
              <option value="weekly">Weekly</option>
            </select>
          </div>

          <div className="space-y-1 sm:col-span-2">
            <label htmlFor="source-keywords" className="text-xs font-medium text-foreground">
              Keywords (comma-separated, optional)
            </label>
            <input
              id="source-keywords"
              name="keywords"
              placeholder="e.g. internship, python, hackathon, 2028"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="sm:col-span-2 pt-2">
            <button
              type="submit"
              className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 transition-colors"
            >
              Add Saved Portal
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}
