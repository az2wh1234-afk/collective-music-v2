# V1.2 quick start

1. Run `supabase/v12_destination.sql` once in the Supabase SQL editor.
2. Upload the **contents** of this project directory to the existing GitHub repository.
3. Wait for Vercel Ready.
4. Host opens website -> Create experience -> Use my current location as destination
   (or enter coordinates) -> Save destination for everyone.
5. Host shows QR or copies invitation URL. Guest scans or opens link and joins automatically.
6. Both tap Allow location / GPS and Start experience.

Developer controls are hidden by default and can be revealed.
QR image currently uses api.qrserver.com, a third-party QR service, which receives
the session invitation URL. Do not use sensitive session URLs.
The current-location destination button uses the host's live position;
choose a safe public meeting spot rather than automatically assuming a building interior.
