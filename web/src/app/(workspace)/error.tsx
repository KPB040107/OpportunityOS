'use client';
import { Button } from '@/components/ui/button';
export default function ErrorPage({reset}:{reset:()=>void}) {
  return <section className="rounded-2xl border border-border bg-white p-8"><h1 className="text-xl font-semibold">We couldn’t load this page.</h1><p className="my-4 text-muted-foreground">Your saved items are still in your account. Please try again.</p><Button onClick={reset}>Try again</Button></section>;
}
