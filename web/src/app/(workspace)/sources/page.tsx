import { requireUser } from '@/lib/auth';
import { Card } from '@/components/ui/card';
import { formatDate } from '@/lib/utils';
import { ToggleButton } from './toggle-button';
import { SeedPresetsButton } from './seed-button';
import { addCustomSource } from './actions';
import { Globe, ArrowUpRight, Rss, Mail, PlusCircle, CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import type { Source } from '@/lib/types';
import {publicUrl} from '@/lib/validation';

export default async function SourcesPage() {
  const { supabase, user } = await requireUser();

  const { data: sourcesData, error } = await supabase
    .from('sources')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error('Sources data unavailable');
  }

  const sources = (sourcesData || []) as Source[];
  const {data:profile}=await supabase.from('profiles').select('email_alias_token').eq('user_id',user.id).maybeSingle();
  const sourceLink=(url:string)=>{try{return publicUrl(url);}catch{return undefined;}};

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Opportunity sources</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Forward announcements from Gmail or Outlook, or keep useful public links here.
          </p>
        </div>
        <SeedPresetsButton />
      </div>
      <Card><h2 className="text-lg font-semibold">Email forwarding</h2>{profile?.email_alias_token?<><p className="mt-3">In Gmail or Outlook, set a forwarding rule for opportunity alerts to your personal address:</p><p className="mt-3 break-all font-mono text-sm">opportunityos0001+{profile.email_alias_token}@gmail.com</p><p className="mt-3 text-sm">This address routes mail to your own inbox. Attachments are not read. Send the announcement in the message text. Forward-provider confirmation messages may need to be confirmed manually.</p></>:<p>Save your profile first to create your forwarding address.</p>}<p className="mt-3 text-xs">The links below are saved configuration. Scheduled website/RSS monitoring remains an event addition; paste a specific announcement URL into your inbox to analyse it now.</p></Card>

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
                          <Rss className="size-3.5 text-amber-600" />
                        ) : src.type === 'email_forward' ? (
                          <Mail className="size-3.5 text-blue-600" />
                        ) : (
                          <Globe className="size-3.5 text-emerald-600" />
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
                              ? 'bg-emerald-50 text-emerald-800'
                              : isError
                              ? 'bg-red-50 text-red-800'
                              : 'bg-amber-50 text-amber-800'
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
              Add Monitored Source
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}
