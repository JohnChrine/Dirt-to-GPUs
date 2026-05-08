# From Dirt to GPUs

Static landing page plus a small local Node backend for subscriber capture and admin review.

## Run locally

```powershell
npm start
```

Open:

- Site: `http://127.0.0.1:8000/`
- Admin: `http://127.0.0.1:8000/admin`

The email signup form only works through the local server URL. Opening
`index.html` directly as a file is fine for visual review, but it cannot call
the backend API.

## Starter admin account

For local development, the default starter account is:

```text
username: george
password: local-admin
```

Before putting this online, set a real username and password:

```powershell
$env:FDTG_ADMIN_USERNAME="your-admin-name"
$env:FDTG_ADMIN_PASSWORD="use-a-long-real-password"
npm start
```

Or create a local `.env` file based on `.env.example`.

On Windows, you can also run:

```powershell
.\RUN-LOCAL.ps1
```

## Data storage

Subscribers are stored in:

```text
data/subscribers.json
```

This same file also stores draft Field Notes, settings, local DM drafts, and event history.

This is intentionally simple for v1. Before launch, move this to a hosted database or newsletter platform integration.

For Railway with a persistent volume, set:

```text
FDTG_DATA_DIR=/data
```

and mount the Railway volume at `/data`.

## Admin features

- Subscriber stats, search, filters, notes, remove, CSV export, JSON export.
- Local direct-message drafts per subscriber.
- Field Notes editor for drafts, published posts, and archived posts.
- Settings for admin name, brand email placeholder, cadence, signup availability, and DM mode.

The first time the server runs, it seeds three private draft Field Notes so the
editor has starting material. They do not show on the public site unless you
mark them as `Published`.
