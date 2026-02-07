# RideMatch

A simple website that matches **drivers** (parents or volunteers) with **students** who need rides to school events.

## What it does

- **Upcoming events** — View school events (concerts, science fair, field day, etc.).
- **Drivers** — Offer a ride: name, phone, event, number of seats, optional notes.
- **Students** — Request a ride: name, phone, event, pickup area, optional notes.
- **Matches** — On the Matches tab, connect a driver with a student for an event. Each match uses one seat from the driver.
- **Sign in / Sign up** — Optional. When signed in, your details autofill on ride forms and you can see **My rides** (your offers and requests only).

**Without Supabase:** Data is in memory and sign-in uses localStorage. Refreshing clears events/drivers/students/matches but keeps accounts.  
**With Supabase:** Login and all ride data (events, drivers, students, matches) are stored in Supabase and persist across devices and refreshes.

## How to run

1. Open the project folder in your editor.
2. Serve the folder with any static server, or open `index.html` directly in a browser.

**Option A — Open file directly**  
Double-click `index.html` or drag it into a browser window.

**Option B — Local server (recommended)**  
From the project folder:

```bash
# Python 3
python -m http.server 8080

# Node (npx)
npx serve .

# VS Code "Live Server" extension
# Right-click index.html → "Open with Live Server"
```

Then go to `http://localhost:8080` (or the port your server uses).

## Supabase (optional)

To persist login and ride data in Supabase:

1. **Create a project** at [supabase.com](https://supabase.com) and get your API keys:  
   **Settings → API** → copy **Project URL** and **anon public** key.

2. **Add them to the app** in `config.js`:
   ```js
   window.RIDEMATCH_SUPABASE_URL = 'https://YOUR_PROJECT.supabase.co';
   window.RIDEMATCH_SUPABASE_ANON_KEY = 'your-anon-key';
   ```

3. **Create the database tables** in the Supabase **SQL Editor** by running the contents of `supabase-setup.sql` (creates `profiles`, `events`, `drivers`, `students`, `matches` and RLS policies).

4. **(Optional)** In **Authentication → Providers**, turn off “Confirm email” if you want sign-in without email verification for testing.

After that, the app will use Supabase for auth and for all events, drivers, students, and matches.

## Tech

- Plain HTML, CSS, and JavaScript (no build step).
- Fonts: Outfit (UI), JetBrains Mono (meta/dates).
- Dark theme with emerald accent to match the Emerald Hackathon.

## Possible next steps

- Supabase is optional; use it for persistent auth and ride data (see above).
- Email/SMS when a match is made.
- Add/edit/remove events from an admin view.
- Tighten Supabase RLS so users can only edit their own drivers/students.
