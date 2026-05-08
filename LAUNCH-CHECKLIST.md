# From Dirt to GPUs Launch Checklist

## Before public launch

- Install official Node.js locally so `npm start` can run outside the Codex app runtime.
- Set a real admin password with `FDTG_ADMIN_PASSWORD`.
- Decide where the list lives long term: local JSON for testing, then Beehiiv/ConvertKit/Buttondown/custom database.
- Create the brand email address.
- Replace draft-only DM with real send flow after the brand email exists.
- Pick the public domain.
- Host the site on Vercel, Netlify, Render, Railway, or a small VPS.
- Add a privacy note near signup before collecting real subscribers.
- Replace local JSON storage before serious traffic, or choose a host with persistent disk and backups.
- Add unsubscribe handling before sending any recurring email.

## Admin v1

- `/admin` is private behind password login.
- Subscribers can be searched, filtered, removed, exported, and annotated.
- DMs are saved as local drafts per subscriber.
- Field Notes can be drafted, published, archived, or deleted.
- Settings control signup availability, brand email placeholder, admin name, cadence, and DM mode.

## First public content

- Publish 3 starter Field Notes before sharing the site widely.
- Post on LinkedIn 3 times in week one.
- End each LinkedIn post softly with the site link.
- Avoid employer names, confidential project details, client names, site locations, non-public timelines, or anything learned under NDA.

## First metrics to watch

- Visitor-to-email conversion.
- Which posts drive signups.
- What people reply asking for.
- Whether readers identify as PMs/supers/vendors/investors/operators.
- Repeated questions that could become a guide, template, or paid product later.
