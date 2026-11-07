# Collective Music V0.6 — arrival pilot

## What changed
- The **walking** participant hears their own layer with distance-controlled gain and speed-controlled low-pass filter.
- The **checked-in** participant hears the accumulation of all arrived layers, e.g. A, then A+B, then A+B+C. The server still assigns one layer per participant.
- GPS-mode check-in requires reported accuracy <= 30m and remaining distance <= 20m **in the browser**. This is a pilot guard, not server-side arrival verification; a malicious client can bypass it.
- Shaker disabled in this version to focus on the filter.

## Local start
1. Copy `.env.local` from your previous version (never upload or share it).
2. `npm install`
3. `npm run dev`
4. Create a new session, join from an incognito window, press Start music on both windows, check in A and then B. Listen on the checked-in window: A then A+B.

## Real phone testing
`http://localhost:5173` only works on your computer. For real phones, deploy the Vite site to an HTTPS host (e.g. Vercel or Netlify) and configure the two VITE_SUPABASE_* environment variables there. **Do not** upload `.env.local` or a service-role key. Set an actual meeting-point latitude/longitude **on each phone** (coordinates are not shared by the server yet). Use earphones and test in a safe, open area. On iOS, keep the browser screen awake; background audio and GPS updates are not guaranteed.

## Limitations / important security notes
- Browser-clock music synchronization was tested in two tabs, not verified on separate phones.
- Destination is not persisted in Supabase; participants must manually set the same coordinates.
- Current pilot RLS SELECT policies expose all sessions and members to authenticated anonymous accounts. Do not use with real identifiable participant data or publicize widely until access control is redesigned.
- Current join function distributes participants among layers; multiple users per layer is allowed, but not yet fully tested. Incremental arrival mixing is client-side using shared checked-in member state.
- GPS accuracy and speed can jitter; do not treat the browser-side check-in as proof of physical presence.


## V0.7 audio fix
- After check-in, the meeting mix no longer follows the walking-speed low-pass filter.
- The local layer remains audible even while the shared check-in list is updating.
- Check-in mix gain is balanced for a clearer transition (test with low device volume).
- Existing Supabase schema and `.env.local` values remain unchanged; copy your own `.env.local` into this folder.
