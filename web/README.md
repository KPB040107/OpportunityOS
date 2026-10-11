# OpportunityOS website

Next.js App Router, TypeScript, Tailwind and shadcn-style components.

Copy .env.example to .env.local and configure the public Supabase project settings plus the server-only n8n ingestion URL. Apply the repository's 0002 migration and publish the 01 Ingest workflow before testing intake. The app uses Supabase Auth and ownership policies; it never uses a service-role key.

Run pnpm install --frozen-lockfile, then pnpm build. From the repository root, scripts/start-website.ps1 starts the local site at http://localhost:3000. For development run pnpm dev --hostname 127.0.0.1 here.

Checks: pnpm exec tsc --noEmit, pnpm lint, pnpm build. Security and database tests, workflow exports, and acceptance status are documented in the repository README and docs/progress.md.

Current features: email/password accounts, editable profile, original-submission inbox, authenticated text/link intake through n8n, and activity. URL fetching, extraction and decisions belong to later slices.
