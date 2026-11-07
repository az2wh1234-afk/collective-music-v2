# V0.9 — Current presence + distance fade

**Required migration:** Supabase Dashboard → SQL Editor → paste and Run `supabase/presence.sql` before deploying. This creates an ephemeral `music_presence` table with row-level security. Keep the existing `supabase/clock.sql` function.

- Each participant hears their own assigned layer while walking.
- After a participant checks in within 20m of the meeting point (GPS accuracy <=30m), their layer is published as **currently present**. The server stores no location coordinates.
- A walker hears the currently present *other* layers fade in from 50m to 5m from the shared meeting point. Moving away fades them out.
- A checked-in participant leaving the point (>=30m, after 8 seconds of GPS reports; immediately in simulation) is removed. Presence also expires after 14 seconds without a heartbeat (e.g. browser suspended).
- All stems run on one transport per device, so layering within a device stays aligned. Acoustic synchronization between different phone speakers is not guaranteed.
- Historical `music_members.checked_in` is **ignored** in V0.9. The new presence table is the only source for who is currently at the meeting.

**Pilot limitations:** Arrival is a manual check-in button, and GPS entry verification is client-side only. Simulation controls are for testing. Each device must use the same meeting-point coordinates. GPS accuracy near buildings and phone background restrictions may affect presence. This is a research prototype, not a production location-verification system.

## Test
1. Run SQL migration and deploy with existing `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
2. Join same session on two devices, Start both; set speed ~2 m/s in Simulation.
3. Set A distance 0m and Check in; set B 60m (A silent on B), then 25m (A fades in), then 5m (A fully audible).
4. Move A to 35m; A leaves the meeting, and A's layer fades out on B. Move A back to 0m and check in again.
