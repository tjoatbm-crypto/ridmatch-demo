# RideMatch

A simple website that matches **drivers** (parents or volunteers) with **students** who need rides to school events.

## What it does

- **Upcoming events** — View school events (concerts, science fair, field day, etc.).
- **Drivers** — Offer a ride: name, phone, event, number of seats, optional notes.
- **Students** — Request a ride: name, phone, event, pickup area, optional notes.
- **Sign in / Sign up** — Optional. When signed in, your details autofill on ride forms and you can see **My rides**.
- **My rides** — View your ride offers and requests, and connect drivers with students for each event. Each match uses one seat from the driver.
- **AI auto-assign** — The day before an event, AI can auto-assign students to drivers based on proximity and available seats (requires Gemini API key).

**Without Supabase:** Data is in memory and sign-in uses localStorage. Refreshing clears events/drivers/students/matches but keeps accounts.  
**With Supabase:** Login and all ride data are stored in the same Supabase database: **events** (name, date, time, location), **drivers** and **students** (signups per event), and **matches**. Data persists across devices and refreshes.

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

3. **Create the database tables** — In the Supabase dashboard go to **SQL Editor** → **New query**, paste the **entire** contents of `supabase-setup.sql`, and click **Run**. This creates `profiles`, `events`, `drivers`, `students`, `matches` and RLS policies. If you see *"could not find the table 'public.events' in the schema cache"*, the tables were not created; run the full script in the same project where your API keys point.

4. **(Optional)** In **Authentication → Providers**, turn off “Confirm email” if you want sign-in without email verification for testing.

After that, the app will use Supabase for auth and for all events, drivers, students, and matches.

## Gemini AI auto-assign (optional)

The day before an event, the app can use Google Gemini AI to auto-assign students to drivers based on proximity (pickup/driver notes) and available seats.

1. Get a free API key at [Google AI Studio](https://aistudio.google.com/apikey).
2. Add it to `config.js`:
   ```js
   window.RIDEMATCH_GEMINI_API_KEY = 'your-gemini-api-key';
   ```
3. On the event page (when the event is tomorrow), an **Auto-assign with AI** button appears. Click it to run the assignment.
4. Assigned matches appear in **My rides** for both drivers and students.

## Tech

- Plain HTML, CSS, and JavaScript (no build step).
- Fonts: Outfit (UI), JetBrains Mono (meta/dates).
- Dark theme with emerald accent to match the Emerald Hackathon.

## Possible next steps

- Supabase is optional; use it for persistent auth and ride data (see above).
- Email/SMS when a match is made.
- Add/edit/remove events from an admin view.
- Tighten Supabase RLS so users can only edit their own drivers/students.
