# Build progress

Current slice: 0 Foundation, in progress.

Prepared: Docker Compose with persistent storage; private encryption-key setup; events migration with read-only per-user access; authenticated foundation workflow; verification script.

Verified locally: n8n container started; localhost health endpoint returned ok; Compose configuration validated; workflow JSON parsed; PowerShell scripts passed syntax checks; repeated setup preserved the existing key. The downloaded n8n image digest is pinned.

User-reported setup: n8n owner login completed; Supabase setup completed.

User-reported connection test: the n8n Postgres credential successfully connected to Supabase.

User-reported workflow test: the local authenticated foundation webhook returned "Database write verified". This verifies the local request-to-database path per the user's test. The earlier 403 was resolved by correcting the Header Auth Name field to X-Foundation-Key.

Restart check: Docker Compose restarted n8n successfully and its health endpoint returned ok. The user repeated the authenticated local webhook test after restart and reported a verified database write, confirming that the published workflow and credentials remained usable.

Public tunnel: verified Cloudflare executable downloaded; webhook-only gateway and Quick Tunnel started in background; public URL applied to n8n without changing the encryption key. Public checks returned 404 for the root and /rest/settings and 403 for the foundation webhook without credentials. Local n8n remains healthy. Gateway security tests passed. The user reported completion of the authenticated public database-write test.

Gemini setup: user reported that the runtime key and n8n credential setup are done, then reported completing the Gemini connection test. Prepared a manual Basic LLM Chain connection test with no profile data or side effects. Its node versions and parameter names were checked against the installed n8n node definitions; the workflow defaults to models/gemini-3.5-flash-lite. Actual account quotas still need to be recorded. The connection-test result is user-reported, not independently inspected.

Acceptance still pending: runtime account quotas; GitHub repository and remote backup.

Dedicated agent mailbox: opportunityos0001@gmail.com, supplied by the user. Use it for incoming forwarded opportunity emails and outgoing agent notifications; it does not limit opportunity sources to Gmail. Mailbox tests are complete per the user's reports.

Gmail app password: user reported completing creation. The secret has not been requested or stored in project files.

Outgoing email credential: user reported completing the SMTP credential setup and the self-addressed delivery test. Prepared the test in workflows/00-email-out-check.json. Send Email v2.1 fields were checked against the installed node definition. The test has no scheduled trigger or automatic retries, and secrets remain in n8n credentials. Delivery completion is user-reported.

Incoming email credential: user reported completing the IMAP credential setup and the plus-addressed receiving test. Prepared workflows/00-email-in-check.json, filtered to unread setup messages addressed to opportunityos0001+setupcheck@gmail.com. The workflow leaves messages unread, does not download attachments, and checks that the plus-address remains in recipient fields. Node settings were checked against the installed IMAP node definition. Receiving and routing test completion is user-reported.

Demo calendar: user reported creating a separate demo calendar under the dedicated agent Google account.

Calendar OAuth: the user's screenshot shows Account connected on the n8n Google Calendar OAuth2 credential and the expected localhost callback. Prepared workflows/00-calendar-check.json with a blank calendar selector so the builder must choose the separate demo calendar. Its event-create fields match the installed node; it creates a private test event tomorrow at 10:00 IST with no attendees, reminders, or invitation updates. A fixed valid event ID prevents duplicate creation on repeat execution. The user reported completing the calendar write and event visibility test.

Google Calendar API: user reported enabling it. Earlier messages gave different project display names; the selected Calendar project was used for the successful authorization. The display name does not affect the integration.

Google OAuth consent: user reported completing the configuration and adding opportunityos0001@gmail.com as a test user. Keep the app in Testing mode and reconnect the Calendar credential before the demo if the testing token expires.

Next objective: prepare the GitHub repository and remote backup, then record actual Gemini account quotas to finish the foundation checklist.

Source control preparation: initialized the local main branch, confirmed .env and runtime files are ignored, scanned source files for common credential tokens, and checked the staged changes for whitespace errors. Source files are prepared for the initial foundation commit; no GitHub remote exists yet.

No slice tag or prototype tag is justified yet. No later slice has begun.

Suggested commit message: `chore: prepare OpportunityOS slice 0 foundation`
