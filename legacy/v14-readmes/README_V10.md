# V1.0 · Two-person proximity audio

- Six provided 48kHz stereo WAVs replace the demo synth. All files are 27.429s and assumed phase-aligned.
- Layer A uses 01_1 / 01_2 based on destination distance; Layer B uses 02_1 / 02_2. Threshold: 60m.
- When two participants approach within 25m, both devices crossfade to BOTH stage-3 files (01_3 + 02_3). Fully mixed by 8m, regardless of destination. As they separate, each returns to their own destination-based stage.
- No check-in. Real GPS is approximate and can jump; pilot outdoors and calibrate thresholds.
- **Run `supabase/positions.sql` once in Supabase SQL Editor before deploying.** Previous clock.sql still needed.
- Simulation: two phones appear on opposite sides of the destination, so equal 10m remaining means ~20m between phones.
- Requires Supabase VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY configured in Vercel as before.
- Privacy: locations are visible to members of same session; do not publicly share session codes. Server retains last positions until deleted; add retention policy before public release.
- Browser location updates and audio can pause when screen locks. This is a prototype, not production-grade continuous tracking.
