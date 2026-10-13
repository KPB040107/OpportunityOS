import { Compass, ArrowUpRight, Check } from 'lucide-react';
import { LoginForm } from './form';
export default async function LoginPage({searchParams}:{searchParams:Promise<{next?:string}>}) {
 const {next}=await searchParams;
  return <main className="grid min-h-screen lg:grid-cols-2">
    <section className="relative flex flex-col justify-between overflow-hidden bg-[#123e32] p-8 text-white lg:p-14">
      <div className="flex items-center gap-3 text-xl font-semibold"><Compass className="size-8"/>OpportunityOS</div>
      <div className="my-16 max-w-lg"><p className="mb-5 text-sm uppercase tracking-[.2em] text-emerald-200">A little less searching. A lot more possibility.</p>
        <h1 className="text-4xl font-semibold leading-tight lg:text-6xl">Your next opportunity starts here.</h1>
        <p className="mt-6 text-lg leading-relaxed text-emerald-100/80">Keep internships, hackathons, scholarships, and programs in one place. Build your profile and save the opportunities that catch your eye.</p>
        <div className="mt-9 flex flex-wrap gap-3">{['One profile','One inbox','Your next step'].map(t=><span key={t} className="flex items-center gap-2 rounded-full border border-white/20 px-4 py-2 text-sm"><Check className="size-4"/>{t}</span>)}</div>
      </div><p className="text-sm text-emerald-100/60">Make room for what comes next. <ArrowUpRight className="ml-2 inline size-4"/></p>
    </section>
    <section className="flex items-center justify-center p-7 lg:p-14"><div className="w-full max-w-md"><p className="mb-3 text-sm font-semibold uppercase tracking-widest text-primary">Welcome to OpportunityOS</p><h2 className="mb-3 text-3xl font-semibold">Let’s find your next step.</h2><p className="mb-8 text-muted-foreground">Sign in or create your student account.</p><LoginForm next={next}/></div></section>
  </main>;
}
