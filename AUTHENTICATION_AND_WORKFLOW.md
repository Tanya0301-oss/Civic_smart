# Authentication and workflow setup

## Apply the database changes

Run the existing database setup so `database/schema.sql` and `database/seed_data.sql` create the `app_users` identities, per-user notifications, SLA deadline, and one-active-assignment index. Back up an existing database before applying schema changes.

Install the Python dependencies and create a local environment file:

```powershell
cd backend
py -m pip install -r requirements.txt
Copy-Item .env.example .env
```

Edit `backend/.env` with PostgreSQL credentials and set `FLASK_SECRET_KEY` to a long random value. Keep `.env` private; it is ignored by Git.

## Create portal credentials

The seeded citizen and officer rows contain placeholder password hashes. Replace each account's password before use. From the `backend` folder, run:

```powershell
py set_account_password.py
py create_admin.py
```

Use a seeded citizen's phone number to sign in as a citizen and an officer ID such as `OFF-RD-104` to sign in as an officer. The admin command prompts for a new administrator username and password. Passwords are hashed by Werkzeug; they are never stored as plain text.

## Current status transitions

| Current status | Allowed authority decisions |
| --- | --- |
| Reported | Verified, Rejected |
| Verified | Rejected |
| Completion Submitted | Resolved, In Progress |
| Disputed | Resolved, In Progress, Rejected |

Officer assignment transitions are `PENDING_ACCEPTANCE → ACCEPTED → IN_PROGRESS → BLOCKED/COMPLETION_SUBMITTED`, with declined assignments returned to `Verified`. Rejection, return-to-work, and resolution decisions require a reason. The Flask endpoint records assignment transitions and the PostgreSQL trigger records complaint status transitions.

## Authority boundaries

- PostgreSQL stores official complaint, assignment, notification, and audit state.
- Flask establishes signed, eight-hour role sessions and enforces citizen, officer, and admin access on protected routes.
- The C++ scheduler chooses an eligible complaint; `sp_allocate_officer()` chooses an officer.
- Browser storage contains a rendering cache and the explicitly labelled offline demo. In database mode, updates are sent to Flask first and the cache refreshes only after a successful response.
- Public tracking by complaint reference hides citizen and officer identity fields. Citizen history and officer assignments require the matching signed-in role.

The local-development session uses `COOKIE_SECURE=0` for HTTP localhost. Set it to `1` behind HTTPS.
