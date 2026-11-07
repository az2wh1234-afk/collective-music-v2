# V0.8 Automatic server clock sync

This replaces the manual sync slider. Before deploying, open your existing Supabase project's SQL Editor and run `supabase/clock.sql` once. This adds the `music_server_time_ms` RPC. Existing music session/member tables and RPCs are unchanged.

Deploy this folder as the Vite project with the same VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY environment variables. Each device estimates server-minus-local clock offset from five round trips (selecting the lowest RTT), then rechecks every 30 seconds. Audio uses the shared session's creation timestamp as its common timeline. The app corrects phase discrepancies >75 ms every two seconds. This reduces device-clock mismatch; it does NOT measure or guarantee correction of hardware speaker/audio pipeline latency. Test with two devices.

TypeScript `tsc --noEmit` passed. Full Vite build was not verified in this environment because the provided macOS node_modules is missing the Linux rollup native optional package. Run `npm install && npm run build` in a clean environment.
