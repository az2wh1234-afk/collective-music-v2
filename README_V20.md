# Collective Music V2.0

Mobile-first participatory sound + light artwork. React + TypeScript + Vite, Tone.js, Supabase, Vercel.
V1.4 sources are archived in `legacy/v14/`; V2 uses new `cm2_*` tables and does not touch the old ones. The seven audio stems in `public/audio/` are unchanged.

## Routes
| Path | Who | What |
|---|---|---|
| `/j/<CODE>/a` | participants | QR A → always Layer 01 (warm) |
| `/j/<CODE>/b` | participants | QR B → always Layer 02 (cool) |
| `/host`, `/host/<id>` | artist (login) | sessions, destination, parameters, QR, monitor, CSV export |
| `/test` | artist (login) | indoor simulator (never writes to the database) |

## Setup
1. Supabase → Authentication → Providers: enable **Anonymous sign-ins** (participants) and **Email** (artist).
2. SQL Editor: run `supabase/v20_schema.sql` once.
3. Authentication → Users → Add user (your email + password), then run:
   `insert into public.cm2_admins(user_id) select id from auth.users where email = 'YOU@EXAMPLE.COM';`
4. Environment variables (Vercel → Settings → Environment Variables, and `.env.local` locally; see `.env.example`): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. Anon key only — never the service_role key.
5. `npm install && npm run build` (runs `tsc --noEmit` then `vite build`). `npm run test:model` runs the interaction-model scenarios.
6. Deploy to Vercel (framework preset: Vite). `vercel.json` rewrites all paths to the SPA.
7. Open `/host` → Create session → set destination (type coordinates, or "Use this device's current location") → Save → QR codes tab (download both PNGs) → Start experiment. People who scan before you press Start see a quiet waiting screen and begin automatically.

The destination never needs a redeploy: create a new session, or End → Reset an old one. Settings are locked by the database (not just the UI) while a session is active.

## Behaviour
- **Presence** (opposite layer connected, any distance) → faint second colour. **Proximity** (25 m → 8 m, configurable) → second light grows and Stage 3 stems fade in. **Arrival** (≤10 m, 3 s dwell, GPS error ≤25 m) → whole screen in the participant's own colour, independent of everyone else. **Collective** → the two colours blend across the screen.
- Same-layer participants never trigger Stage 3: the server returns opposite-layer peers only.
- Only each participant's latest position is stored; deleted on leave and when the session ends. Events and surveys are stored only for participants who ticked consent; ids are per-session hashes, not account ids.
- Heartbeat every 3 s; presence expires after 20 s (configurable).

## Before public use
- Fill `[Minkyeing Jo]` / `[mjo@risd.edu]` in `src/copy.ts` and have the research notice reviewed (advisor / IRB).
- Free-text survey answers can contain personal details even though no identifiers are requested.

## Verification status (honest)
- `npm run test:model` — 24 scenario checks on the interaction logic pass (arrive alone, brief pass, poor accuracy, stage hysteresis, volume monotonic, presence without proximity, proximity ramp, gradual separation, GPS loss).
- TypeScript: checked in the authoring sandbox only against stand-in type declarations, because npm was unreachable there. **Run `npm install && npm run build` yourself first** and fix anything it reports.
- Not verified: SQL has never been run against a Supabase project; Vite production build; any behaviour on real phones.

## Field-test checklist (real phones)
- [ ] iPhone Safari: Begin → location, motion/orientation and sound all work (check ringer switch).
- [ ] Android Chrome: same.
- [ ] Both QRs open the correct layer from anywhere; refresh/re-scan rejoins.
- [ ] Stage 2 at ~60 m; volume 60→100 % over the first 10 m; walking away does not raise it.
- [ ] Filter closes when still, opens when walking, fully open within 10 m of the destination.
- [ ] Arrival alone: whole screen lit and stays lit; no flicker at the radius edge.
- [ ] Second colour appears when the other layer connects, from far away; grows on approach; follows phone rotation, falls back to a soft glow without compass.
- [ ] 25 m → 8 m collective fade; separating fades back; two colours blend.
- [ ] Screen lock / backgrounding: sound and presence recover on return.
- [ ] Airplane mode ~20 s → "Connection lost", then recovery.
- [ ] End session → music and light fade, survey offered; Leave works; CSV exports open correctly.
- [ ] Two phones' loops sound in sync (estimated from the server clock; not guaranteed).

## Troubleshooting
- Anonymous sign-in error → step 1. "Artist access required" → step 3.
- Silent on iPhone → check the ringer switch and tap the screen once.
- No direction light → compass permission denied or no magnetometer; the soft-glow fallback is intentional.
