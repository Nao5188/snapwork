# Security Follow-ups

Last updated: 2026-07-24

## Open

- [ ] Align the app URL scheme with the SalonCloud brand.

  Current state:
  - App display name is `SalonCloud`.
  - Expo URL scheme is `photovideomanager`.
  - Supabase Auth redirect URLs currently need to keep using
    `photovideomanager:///login` and `photovideomanager:///reset-password`
    for the already distributed production app.

  Target state:
  - Consider changing the native URL scheme to `saloncloud`.
  - Add Supabase Auth redirect URLs for both the old and new schemes during
    migration.

  Notes:
  - Changing `expo.scheme` requires a new native production build. EAS Update is
    not enough.
  - Keep the old `photovideomanager` redirect URLs until older installed app
    versions are no longer supported.
  - Re-test sign-up confirmation and password reset links after the change.
