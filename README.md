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

Local development stores subscribers in:

```text
data/subscribers.json
```

This same file also stores draft Field Notes, settings, local DM drafts, and event history.

Production should use Postgres so deploys do not reset live posts or subscribers.
When `DATABASE_URL` is set, the app stores the full live state in Postgres
instead of the local JSON file.

For Railway, add a Postgres database to the project, attach its `DATABASE_URL`
variable to this web service, deploy, then restore the latest admin backup once.

For Railway with a persistent volume instead, set:

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
