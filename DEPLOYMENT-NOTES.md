# Deployment Notes

## Current architecture

The current project is intentionally simple:

- Static public site
- Plain Node backend with no package dependencies
- Local JSON storage in `data/subscribers.json`
- Password-protected admin dashboard

That is good for local testing and shaping the product. It is not the final
production architecture once real subscribers are coming in.

## Recommended public v1 path

For the first real launch, use one of these:

1. **Vercel or Netlify + hosted email/list provider**
   - Keep the public site static.
   - Use Beehiiv, ConvertKit, Buttondown, or similar for the actual subscriber list.
   - Use admin dashboard mostly for content/drafts unless we connect their API.

2. **Render/Railway/Fly.io + small database**
   - Host this Node app as-is with a real database.
   - Replace local JSON storage with Postgres or SQLite on persistent disk.
   - Keep `/admin` private behind a strong password.

## Before taking real subscribers

- Install official Node.js locally and verify `npm start`.
- Change `FDTG_ADMIN_PASSWORD`.
- Set `FDTG_SESSION_SECRET`.
- Decide the email/list provider.
- Add a proper unsubscribe flow.
- Add a real privacy page and footer contact email.
- Keep employer names, client names, site locations, non-public schedules, and confidential details out of public posts.

## Future backend upgrades

- Real email sending from the DM draft box.
- Subscriber tags and segments.
- Import/export with Beehiiv/ConvertKit/Buttondown.
- Per-post open/click tracking if using a newsletter provider.
- Basic public article pages instead of only preview cards.
- Admin user accounts instead of one password.
