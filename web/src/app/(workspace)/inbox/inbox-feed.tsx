'use client';
import { useState, useTransition, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Bookmark,
  EyeOff,
  ExternalLink,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  ArrowUpRight,
  Globe,
  VolumeX,
  Volume2
} from 'lucide-react';
import { deadlineLabel, trustBadgeDetails } from '@/lib/analysis';
import { isRoleRelevantToField } from '@/lib/field-relevance';
import { toggleSaveAction, toggleHideAction, setSourcePreferenceAction } from './actions';

export interface FeedOpportunity {
  id: string;
  title: string;
  organization: string;
  type: string;
  location: string | null;
  deadline: string | null;
  application_url: string | null;
  skills: string[];
  ambiguity_flags: string[];
  trust_tier: string;
  source_badge: string | null;
  risk_signals: string[];
  seniority_level: string;
  created_at: string;
  is_saved: boolean;
  is_hidden: boolean;
  match?: {
    id: string;
    decision: 'ACT' | 'ASK' | 'IGNORE' | null;
    eligibility_status: string | null;
    match_score: number | null;
    confidence: number | null;
    explanation: string | null;
    reason_codes: string[] | null;
  };
}

export function InboxFeed({
  serverFiltered = false,
  initialOpportunities,
  totalCount,
  currentPage: propCurrentPage,
  pageSize: propPageSize,
  allEmployers = [],
  currentParams = {},
  userSourcePreferences = {},
  profileBranch
}: {
  serverFiltered?: boolean;
  initialOpportunities: FeedOpportunity[];
  totalCount?: number;
  currentPage?: number;
  pageSize?: number;
  allEmployers?: string[];
  currentParams?: Record<string, string | undefined>;
  autonomyMode?: string;
  userSourcePreferences?: Record<string, string>;
  profileBranch?: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [opportunities, setOpportunities] = useState<FeedOpportunity[]>(initialOpportunities);
  const [sourcePrefs, setSourcePrefs] = useState<Record<string, string>>(userSourcePreferences);
  const [view, setView] = useState<'best' | 'all'>(currentParams.view === 'all' ? 'all' : 'best');
  const [search, setSearch] = useState(currentParams.q || '');
  const [selectedType, setSelectedType] = useState<string>(currentParams.type || 'all');
  const [selectedEmployer, setSelectedEmployer] = useState<string>(currentParams.employer || 'all');
  const [selectedEligibility, setSelectedEligibility] = useState<string>(currentParams.eligibility || 'all');
  const [selectedDecision, setSelectedDecision] = useState<string>(currentParams.decision || 'all');
  const [selectedTrust, setSelectedTrust] = useState<string>(currentParams.trust || 'all');
  const [selectedDeadline, setSelectedDeadline] = useState<string>(currentParams.deadline || 'all');
  const [selectedLocation, setSelectedLocation] = useState<string>(currentParams.location || 'all');
  const [savedOnly, setSavedOnly] = useState(currentParams.saved === 'true');
  const [showHidden, setShowHidden] = useState(currentParams.hidden === 'true');
  const [fieldFilter, setFieldFilter] = useState<string>(
    currentParams.field || (profileBranch ? 'matching_field' : 'all')
  );
  const [currentPage, setCurrentPage] = useState(propCurrentPage || 1);
  const PAGE_SIZE = propPageSize || 20;
  const MAX_CAPPED = 50;
  const isServerPaginated = totalCount !== undefined;
  const [pending, start] = useTransition();

  const [prevInitial, setPrevInitial] = useState(initialOpportunities);
  if (prevInitial !== initialOpportunities) {
    setPrevInitial(initialOpportunities);
    setOpportunities(initialOpportunities);
  }

  const navigateWithParam = (updates: Record<string, string | number | undefined | null>) => {
    const current = new URLSearchParams(searchParams ? searchParams.toString() : '');
    for (const [key, value] of Object.entries(updates)) {
      if (value === undefined || value === null || value === '' || (value === 'all' && key !== 'field' && key !== 'view') || (key === 'page' && Number(value) === 1)) {
        current.delete(key);
      } else {
        current.set(key, String(value));
      }
    }
    const queryStr = current.toString();
    start(() => {
      router.push(queryStr ? `${pathname}?${queryStr}` : pathname);
    });
  };

  // Unique employers for filter dropdown
  const employers = useMemo(() => {
    if (allEmployers && allEmployers.length > 0) return allEmployers;
    const set = new Set<string>();
    opportunities.forEach((o) => {
      if (o.organization) set.add(o.organization);
    });
    return Array.from(set).sort();
  }, [opportunities, allEmployers]);

  const [actionError,setActionError] = useState('');
  const handleToggleSave = (id:string) => {
    start(async()=>{setActionError('');try {
      const res=await toggleSaveAction(id);
      if(!res.success) throw new Error('Could not save the change. Please retry.');
      setOpportunities(prev=>prev.map(o=>o.id===id?{...o,is_saved:!!res.is_saved}:o));
      router.refresh();
    } catch {setActionError('Could not save the change. Please retry.');}});
  };
  const handleToggleHide = (id:string) => {
    start(async()=>{setActionError('');try {
      const res=await toggleHideAction(id);
      if(!res.success) throw new Error('Could not hide this opportunity.');
      setOpportunities(prev=>prev.map(o=>o.id===id?{...o,is_hidden:!!res.is_hidden}:o));
      router.refresh();
    } catch {setActionError('Could not hide this opportunity. Please retry.');}});
  };
  const handleToggleMuteSource = (source:string) => {
    const next=sourcePrefs[source.toLowerCase()]==='muted'?'normal':'muted';
    start(async()=>{setActionError('');try {
      const res=await setSourcePreferenceAction(source,next);
      if(!res.success) throw new Error('Could not update source preference.');
      setSourcePrefs(prev=>({...prev,[source.toLowerCase()]:next}));router.refresh();
    } catch {setActionError('Could not update source preference. Please retry.');}});
  };

  // Filtered & Ranked Opportunities
  const filteredOpportunities = useMemo(() => {
    return opportunities.filter((o) => {
      // Hidden check
      if (!showHidden && o.is_hidden) return false;
      // Saved check
      if (savedOnly && !o.is_saved) return false;
      // Muted source check (exclude muted unless explicitly filtering by that employer)
      const pref = sourcePrefs[o.organization?.toLowerCase()] || 'normal';
      if (selectedEmployer === 'all' && pref === 'muted') return false;

      // Type filter
      if (selectedType !== 'all' && o.type !== selectedType) return false;
      // Employer filter
      if (selectedEmployer !== 'all' && o.organization?.toLowerCase() !== selectedEmployer.toLowerCase()) {
        return false;
      }
      // Eligibility filter
      if (selectedEligibility !== 'all') {
        const elig = o.match?.eligibility_status || 'UNKNOWN';
        if (selectedEligibility === 'ELIGIBLE' && elig !== 'ELIGIBLE') return false;
        if (selectedEligibility === 'UNKNOWN' && elig !== 'UNKNOWN') return false;
        if (selectedEligibility === 'INELIGIBLE' && elig !== 'INELIGIBLE') return false;
      }
      // Decision filter
      if (selectedDecision !== 'all' && o.match?.decision !== selectedDecision) return false;

      // Trust tier filter
      if (selectedTrust !== 'all' && o.trust_tier?.toLowerCase() !== selectedTrust.toLowerCase()) {
        return false;
      }

      // Deadline filter (supports explicit unknown deadline)
      if (selectedDeadline !== 'all') {
        const today = new Date().toISOString().slice(0, 10);
        if (selectedDeadline === 'unknown') {
          if (o.deadline !== null && o.deadline !== undefined && String(o.deadline).trim() !== '') {
            return false;
          }
        } else if (selectedDeadline === 'upcoming') {
          if (!o.deadline || o.deadline < today) {
            return false;
          }
        }
      }

      // Location filter
      if (selectedLocation !== 'all') {
        const loc = (o.location || '').toLowerCase();
        if (selectedLocation === 'remote' && !loc.includes('remote')) return false;
        if (selectedLocation === 'onsite' && (loc.includes('remote') || !loc)) return false;
      }

      // Search query
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        const text = `${o.title} ${o.organization} ${o.skills.join(' ')} ${o.location || ''}`.toLowerCase();
        if (!text.includes(q)) return false;
      }

      // Field of study relevance check (e.g. Computer Science & Data Science)
      if (fieldFilter === 'matching_field' && profileBranch) {
        const fieldCheck = isRoleRelevantToField(
          { title: o.title, skills: o.skills, type: o.type },
          profileBranch
        );
        if (!fieldCheck.relevant) return false;
      }

      return true;
    });
  }, [
    opportunities,
    showHidden,
    savedOnly,
    sourcePrefs,
    selectedType,
    selectedEmployer,
    selectedEligibility,
    selectedDecision,
    selectedTrust,
    selectedDeadline,
    selectedLocation,
    search,
    fieldFilter,
    profileBranch
  ]);

  // Apply Source Diversity for 'best' view:
  // Cap at 3 listings from the same employer in the first 12 recommendations when other sources exist
  const diverseOpportunities = useMemo(() => {
    if (view === 'all' || selectedEmployer !== 'all') {
      return filteredOpportunities;
    }

    const counts: Record<string, number> = {};
    const topTier: FeedOpportunity[] = [];
    const remaining: FeedOpportunity[] = [];

    // Prioritize eligible, high match, and internships/entry-level
    const sorted = [...filteredOpportunities].sort((a, b) => {
      const aDec = a.match?.decision === 'ACT' ? 1 : a.match?.decision === 'ASK' ? 2 : 3;
      const bDec = b.match?.decision === 'ACT' ? 1 : b.match?.decision === 'ASK' ? 2 : 3;
      if (aDec !== bDec) return aDec - bDec;

      const aScore = a.match?.match_score ?? -1;
      const bScore = b.match?.match_score ?? -1;
      if (aScore !== bScore) return bScore - aScore;

      const aSen = a.seniority_level === 'intern' ? 1 : a.seniority_level === 'entry' ? 2 : 3;
      const bSen = b.seniority_level === 'intern' ? 1 : b.seniority_level === 'entry' ? 2 : 3;
      if (aSen !== bSen) return aSen - bSen;

      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    for (const opp of sorted) {
      const org = opp.organization?.toLowerCase() || 'unknown';
      const count = counts[org] || 0;
      if (count < 3 || topTier.length >= 12) {
        topTier.push(opp);
        counts[org] = count + 1;
      } else {
        remaining.push(opp);
      }
    }

    return [...topTier, ...remaining];
  }, [filteredOpportunities, view, selectedEmployer]);

  // Stable pagination: 20 per page, capped at max 50 items
  const serverTotalCount = totalCount ?? opportunities.length;
  const totalPages = Math.max(1, Math.ceil(serverTotalCount / PAGE_SIZE));
  const activePage = isServerPaginated ? (propCurrentPage || 1) : Math.min(currentPage, totalPages);
  const safeCurrentPage = Math.min(activePage, totalPages);

  // For server-paginated mode, opportunities are already fetched and bounded to the current page.
  // For client-paginated mode, slice from diverseOpportunities.
  const displayedOpportunities = isServerPaginated
    ? (serverFiltered ? opportunities : diverseOpportunities)
    : diverseOpportunities.slice((safeCurrentPage - 1) * PAGE_SIZE, safeCurrentPage * PAGE_SIZE);

  const startIndex = (safeCurrentPage - 1) * PAGE_SIZE;
  const endIndex = isServerPaginated
    ? Math.min(startIndex + opportunities.length, serverTotalCount)
    : Math.min(startIndex + PAGE_SIZE, serverTotalCount);
  const totalCappedCount = serverTotalCount;

  // Count per employer in raw list
  const employerCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    opportunities.forEach((o) => {
      if (o.organization) counts[o.organization] = (counts[o.organization] || 0) + 1;
    });
    return counts;
  }, [opportunities]);

  const handlePageChange = (p: number) => {
    if (isServerPaginated) {
      navigateWithParam({ page: p });
    } else {
      setCurrentPage(p);
    }
  };

  return (
    <div className="space-y-6">
      {actionError && <p role="alert" className="text-sm text-red-700">{actionError}</p>}
      {/* View Switcher & Search Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-4">
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-border bg-muted/40 p-1 text-xs">
            <button
              onClick={() => {
                setView('best');
                setSelectedEmployer('all');
                if (isServerPaginated) navigateWithParam({ view: 'best', employer: null, page: 1 });
              }}
              className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
                view === 'best' ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Best Matches (Diverse)
            </button>
            <button
              onClick={() => {
                setView('all');
                if (isServerPaginated) navigateWithParam({ view: 'all', page: 1 });
              }}
              className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
                view === 'all' ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              All Discoveries ({serverTotalCount})
            </button>
          </div>
          {savedOnly && (
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
              Saved Only
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1 sm:flex-initial">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search title, company, skill..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  if (isServerPaginated) navigateWithParam({ q: search, page: 1 });
                }
              }}
              className="h-9 pl-8 text-xs bg-white"
            />
          </div>
          <Button
            size="sm"
            variant={savedOnly ? 'default' : 'outline'}
            onClick={() => {
              const next = !savedOnly;
              setSavedOnly(next);
              setCurrentPage(1);
              if (isServerPaginated) navigateWithParam({ saved: next ? 'true' : null, page: 1 });
            }}
            className="gap-1.5 text-xs h-9"
          >
            <Bookmark className={`size-3.5 ${savedOnly ? 'fill-current' : ''}`} />
            Saved
          </Button>
          <Button
            size="sm"
            variant={showHidden ? 'default' : 'outline'}
            onClick={() => {
              const next = !showHidden;
              setShowHidden(next);
              setCurrentPage(1);
              if (isServerPaginated) navigateWithParam({ hidden: next ? 'true' : null, page: 1 });
            }}
            className="gap-1.5 text-xs h-9 text-muted-foreground"
          >
            <EyeOff className="size-3.5" />
            {showHidden ? 'Hiding Hidden' : 'Show Hidden'}
          </Button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="flex items-center gap-1 font-medium text-muted-foreground mr-1">
          <Filter className="size-3.5" /> Filters:
        </span>

        {/* Field of Study Relevancy Filter */}
        {profileBranch && (
          <select
            value={fieldFilter}
            onChange={(e) => {
              const val = e.target.value;
              setFieldFilter(val);
              setCurrentPage(1);
              if (isServerPaginated) navigateWithParam({ field: val === 'matching_field' ? null : val, page: 1 });
            }}
            className="rounded-lg border border-primary/40 bg-primary/5 px-2.5 py-1 text-xs font-medium text-primary cursor-pointer"
            title={`Filter opportunities matching your academic field: ${profileBranch}`}
          >
            <option value="matching_field">Field: {profileBranch}</option>
            <option value="all">Field: All Disciplines</option>
          </select>
        )}

        {/* Opportunity Type */}
        <select
          value={selectedType}
          onChange={(e) => {
            const val = e.target.value;
            setSelectedType(val);
            setCurrentPage(1);
            if (isServerPaginated) navigateWithParam({ type: val, page: 1 });
          }}
          className="rounded-lg border border-border bg-white px-2.5 py-1 text-xs"
        >
          <option value="all">All Types</option>
          <option value="internship">Internships</option>
          <option value="job">Jobs</option>
          <option value="hackathon">Hackathons</option>
        </select>

        {/* Employer Filter */}
        <select
          value={selectedEmployer}
          onChange={(e) => {
            const val = e.target.value;
            setSelectedEmployer(val);
            setCurrentPage(1);
            if (isServerPaginated) navigateWithParam({ employer: val, page: 1 });
          }}
          className="rounded-lg border border-border bg-white px-2.5 py-1 text-xs"
        >
          <option value="all">All Employers ({employers.length})</option>
          {employers.map((emp) => (
            <option key={emp} value={emp}>
              {emp} ({employerCounts[emp] || 0})
            </option>
          ))}
        </select>

        {/* Eligibility Filter */}
        <select
          value={selectedEligibility}
          onChange={(e) => {
            const val = e.target.value;
            setSelectedEligibility(val);
            setCurrentPage(1);
            if (isServerPaginated) navigateWithParam({ eligibility: val, page: 1 });
          }}
          className="rounded-lg border border-border bg-white px-2.5 py-1 text-xs"
        >
          <option value="all">All Eligibility</option>
          <option value="ELIGIBLE">Eligible</option>
          <option value="UNKNOWN">Needs Info (Unknown)</option>
          <option value="INELIGIBLE">Ineligible</option>
        </select>

        {/* Decision Filter */}
        <select
          value={selectedDecision}
          onChange={(e) => {
            const val = e.target.value;
            setSelectedDecision(val);
            setCurrentPage(1);
            if (isServerPaginated) navigateWithParam({ decision: val, page: 1 });
          }}
          className="rounded-lg border border-border bg-white px-2.5 py-1 text-xs"
        >
          <option value="all">All Decisions</option>
          <option value="ACT">ACT (Autonomous / Tracked)</option>
          <option value="ASK">ASK (Needs Review)</option>
          <option value="IGNORE">IGNORE (Filtered)</option>
        </select>

        {/* Trust Tier Filter */}
        <select
          value={selectedTrust}
          onChange={(e) => {
            const val = e.target.value;
            setSelectedTrust(val);
            setCurrentPage(1);
            if (isServerPaginated) navigateWithParam({ trust: val, page: 1 });
          }}
          className="rounded-lg border border-border bg-white px-2.5 py-1 text-xs"
        >
          <option value="all">All Trust Tiers</option>
          <option value="corroborated">Corroborated</option>
          <option value="attributed">Attributed</option>
          <option value="unverified">Unverified</option>
        </select>

        {/* Deadline Filter with explicit unknown-deadline */}
        <select
          value={selectedDeadline}
          onChange={(e) => {
            const val = e.target.value;
            setSelectedDeadline(val);
            setCurrentPage(1);
            if (isServerPaginated) navigateWithParam({ deadline: val, page: 1 });
          }}
          className="rounded-lg border border-border bg-white px-2.5 py-1 text-xs"
        >
          <option value="all">All Deadlines</option>
          <option value="upcoming">Upcoming Only</option>
          <option value="unknown">Unknown Deadline (Not Stated)</option>
        </select>

        {/* Location Filter */}
        <select
          value={selectedLocation}
          onChange={(e) => {
            const val = e.target.value;
            setSelectedLocation(val);
            setCurrentPage(1);
            if (isServerPaginated) navigateWithParam({ location: val, page: 1 });
          }}
          className="rounded-lg border border-border bg-white px-2.5 py-1 text-xs"
        >
          <option value="all">All Locations</option>
          <option value="remote">Remote Only</option>
          <option value="onsite">On-site / In-person</option>
        </select>

        {(selectedType !== 'all' ||
          selectedEmployer !== 'all' ||
          selectedEligibility !== 'all' ||
          selectedDecision !== 'all' ||
          selectedTrust !== 'all' ||
          selectedDeadline !== 'all' ||
          selectedLocation !== 'all' ||
          search) && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setSelectedType('all');
              setSelectedEmployer('all');
              setSelectedEligibility('all');
              setSelectedDecision('all');
              setSelectedTrust('all');
              setSelectedDeadline('all');
              setSelectedLocation('all');
              setSearch('');
              setCurrentPage(1);
              if (isServerPaginated) router.push(pathname);
            }}
            className="text-xs h-7 px-2 text-primary hover:underline"
          >
            Clear filters
          </Button>
        )}
      </div>

      {/* Active Source Filter Banner */}
      {selectedEmployer !== 'all' && (
        <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs flex items-center justify-between">
          <span className="flex items-center gap-1.5 font-medium">
            <Globe className="size-3.5 text-primary" />
            Showing all {employerCounts[selectedEmployer] || 0} listings from{' '}
            <strong className="text-foreground">{selectedEmployer}</strong>
          </span>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleToggleMuteSource(selectedEmployer)}
              className="h-7 text-xs gap-1"
            >
              {sourcePrefs[selectedEmployer.toLowerCase()] === 'muted' ? (
                <>
                  <Volume2 className="size-3 text-emerald-600" /> Unmute source
                </>
              ) : (
                <>
                  <VolumeX className="size-3 text-red-600" /> Mute this source
                </>
              )}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelectedEmployer('all')}
              className="h-7 text-xs text-primary hover:underline"
            >
              Reset to Diverse View
            </Button>
          </div>
        </div>
      )}

      {/* Results Header */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Showing {totalCappedCount === 0 ? 0 : startIndex + 1}–{endIndex} of {totalCappedCount}{' '}
          {view === 'best' ? 'curated recommendations' : 'discoveries'}
          {diverseOpportunities.length > MAX_CAPPED && (
            <span className="ml-1 text-[11px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">
              (capped at top {MAX_CAPPED} of {diverseOpportunities.length})
            </span>
          )}
        </span>
        {view === 'best' && selectedEmployer === 'all' && (
          <span className="text-[11px] bg-slate-100 rounded px-2 py-0.5">
            Source diversity active: max 3 per employer in top recommendations
          </span>
        )}
      </div>

      {/* Opportunity Grid */}
      {displayedOpportunities.length === 0 ? (
        <Card className="py-12 text-center bg-muted/20">
          <HelpCircle className="mx-auto mb-3 size-8 text-muted-foreground" />
          <h3 className="text-base font-semibold">No opportunities match the selected criteria</h3>
          <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
            Try adjusting your search terms, changing filters, or toggling &quot;Show Hidden&quot;.
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {displayedOpportunities.map((opp) => {
            const badge = trustBadgeDetails(opp.trust_tier, opp.source_badge);
            const match = opp.match;
            const isInsufficient =
              match?.eligibility_status === 'UNKNOWN' ||
              match?.reason_codes?.includes('UNKNOWN_ELIGIBILITY') ||
              (match?.match_score === 0 && (!match?.confidence || match?.confidence === 0));

            const totalFromEmployer = employerCounts[opp.organization] || 0;
            const isMuted = sourcePrefs[opp.organization?.toLowerCase()] === 'muted';

            return (
              <Card
                key={opp.id}
                className={`p-5 flex flex-col justify-between transition-shadow hover:shadow-sm ${
                  opp.is_hidden ? 'opacity-50 border-dashed' : ''
                }`}
              >
                <div>
                  {/* Top Badges */}
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs font-semibold uppercase tracking-wider text-primary">
                        {opp.type}
                      </span>
                      {opp.seniority_level && opp.seniority_level !== 'uncertain' && (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium capitalize text-slate-700">
                          {opp.seniority_level}
                        </span>
                      )}
                      {isMuted && (
                        <span className="rounded bg-red-100 text-red-800 text-[10px] px-1.5 py-0.5 font-medium">
                          Muted
                        </span>
                      )}
                    </div>
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium border ${badge.className}`}>
                      {badge.label}
                    </span>
                  </div>

                  {/* Title & Employer */}
                  <h3 className="text-lg font-semibold leading-snug">
                    <Link href={`/opportunities/${opp.id}`} className="hover:text-primary transition-colors">
                      {opp.title || 'Untitled Opportunity'}
                    </Link>
                  </h3>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{opp.organization || 'Organisation unknown'}</span>
                    {totalFromEmployer > 1 && selectedEmployer === 'all' && (
                      <button
                        onClick={() => setSelectedEmployer(opp.organization)}
                        className="text-primary hover:underline font-medium"
                      >
                        · More from this source ({totalFromEmployer})
                      </button>
                    )}
                  </div>

                  {/* Risk Signals */}
                  {opp.risk_signals && opp.risk_signals.length > 0 && (
                    <p className="mt-2 text-xs font-medium text-red-700 bg-red-50 p-2 rounded-lg border border-red-200">
                      Risk Signal: {opp.risk_signals.join(' · ')}
                    </p>
                  )}

                  {/* Details dl */}
                  <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <div>
                      <dt className="text-[11px]">Deadline</dt>
                      <dd className="font-medium text-foreground">{deadlineLabel(opp.deadline)}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px]">Location</dt>
                      <dd className="font-medium text-foreground truncate">{opp.location || 'Unknown'}</dd>
                    </div>
                  </dl>

                  {/* Skills */}
                  {opp.skills.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap gap-1">
                      {opp.skills.slice(0, 4).map((s) => (
                        <span key={s} className="rounded bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                          {s}
                        </span>
                      ))}
                      {opp.skills.length > 4 && (
                        <span className="text-[10px] text-muted-foreground self-center">
                          +{opp.skills.length - 4} more
                        </span>
                      )}
                    </div>
                  )}

                  {/* Decision & Honest Score */}
                  <div className="mt-4 pt-3 border-t border-border">
                    <div className="flex flex-wrap items-center gap-2 mb-1.5">
                      {match?.decision ? (
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            match.decision === 'ACT'
                              ? 'bg-emerald-100 text-emerald-900'
                              : match.decision === 'ASK'
                              ? 'bg-amber-100 text-amber-900'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {match.decision}
                        </span>
                      ) : (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                          Awaiting Evaluation
                        </span>
                      )}

                      {/* Honest Score Rendering */}
                      {isInsufficient ? (
                        <span className="rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[11px] font-medium text-amber-900">
                          Insufficient information to score
                        </span>
                      ) : match?.match_score !== null && match?.match_score !== undefined ? (
                        <span className="text-xs text-muted-foreground font-medium">
                          Match {match.match_score}/100 · {Math.round((match.confidence || 0) * 100)}% confidence
                        </span>
                      ) : null}
                    </div>
                    {match?.explanation && (
                      <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                        {match.explanation}
                      </p>
                    )}
                  </div>
                </div>

                {/* Card Actions & Next Steps */}
                <div className="mt-4 pt-3 border-t border-border flex flex-wrap items-center justify-between gap-2">
                  {/* Next Step Pill */}
                  <div className="text-xs">
                    {match?.decision === 'ASK' && match.eligibility_status === 'ELIGIBLE' ? (
                      <Link
                        href="/approvals"
                        className="inline-flex items-center gap-1 font-semibold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-md border border-amber-200 hover:bg-amber-100 transition-colors"
                      >
                        <AlertTriangle className="size-3.5 text-amber-600" />
                        Approve in Center
                      </Link>
                    ) : match?.eligibility_status === 'UNKNOWN' ? (
                      <Link
                        href="/approvals"
                        className="inline-flex items-center gap-1 font-medium text-sky-700 bg-sky-50 px-2.5 py-1 rounded-md border border-sky-200 hover:bg-sky-100 transition-colors"
                      >
                        <HelpCircle className="size-3.5 text-sky-600" />
                        Needs Review
                      </Link>
                    ) : match?.decision === 'ACT' ? (
                      <span className="inline-flex items-center gap-1 text-emerald-700 text-[11px] font-medium">
                        <CheckCircle2 className="size-3.5 text-emerald-600" />
                        Tracked autonomously
                      </span>
                    ) : (
                      <Link
                        href={`/opportunities/${opp.id}`}
                        className="inline-flex items-center gap-1 text-xs text-primary font-medium hover:underline"
                      >
                        Inspect details
                        <ArrowUpRight className="size-3" />
                      </Link>
                    )}
                  </div>

                  {/* Action Buttons: Save, Hide, Link */}
                  <div className="flex items-center gap-1.5">
                    {opp.application_url && (
                      <Button asChild size="sm" variant="ghost" className="h-8 px-2 text-xs">
                        <a href={opp.application_url} target="_blank" rel="noopener noreferrer" title="View original listing">
                          <ExternalLink className="size-3.5" />
                        </a>
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant={opp.is_saved ? 'default' : 'ghost'}
                      onClick={() => handleToggleSave(opp.id)}
                      disabled={pending}
                      className="h-8 px-2.5 text-xs gap-1"
                      title={opp.is_saved ? 'Unsave' : 'Save / Bookmark'}
                    >
                      <Bookmark className={`size-3.5 ${opp.is_saved ? 'fill-current' : ''}`} />
                      {opp.is_saved ? 'Saved' : 'Save'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleToggleHide(opp.id)}
                      disabled={pending}
                      className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground"
                      title={opp.is_hidden ? 'Unhide' : 'Hide / Not interested'}
                    >
                      <EyeOff className="size-3.5" />
                      {opp.is_hidden ? 'Unhide' : 'Hide'}
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Stable Pagination Controls */}
      {totalCappedCount > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 border-t border-border text-xs text-muted-foreground">
          <div>
            Showing {totalCappedCount === 0 ? 0 : startIndex + 1}–{endIndex} of {totalCappedCount} items
            {totalPages > 1 && ` (Page ${safeCurrentPage} of ${totalPages})`}
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={safeCurrentPage <= 1}
              onClick={() => handlePageChange(Math.max(1, safeCurrentPage - 1))}
              className="h-8 text-xs px-3"
            >
              Previous
            </Button>
            <div className="flex items-center gap-1">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <Button
                  key={p}
                  size="sm"
                  variant={p === safeCurrentPage ? 'default' : 'ghost'}
                  onClick={() => handlePageChange(p)}
                  className="h-8 w-8 p-0 text-xs"
                >
                  {p}
                </Button>
              ))}
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={safeCurrentPage >= totalPages}
              onClick={() => handlePageChange(Math.min(totalPages, safeCurrentPage + 1))}
              className="h-8 text-xs px-3"
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
