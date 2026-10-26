# SBMCH · Student Roll Directory

A small static website for the students of **SBMCH**.

- **Register** with full name, class roll number, prof roll number and **session** (2022-23, 2023-24 or 2024-25).
- **Log in** with the prof roll number and your session — both must match the details you registered with.
- After logging in, **verify with your class roll number** to open the class directory. It lists the **prof roll number, name and class roll number** of every registered student **of your own session** — never another session's — with a search box for finding anyone by name or prof roll.

The site is plain HTML/CSS/JS with no build step — push it to GitHub and GitHub Pages serves it.

| File | Purpose |
| --- | --- |
| `index.html` | The page (login / register / gate / directory) |
| `styles.css` | Styling |
| `app.js` | Login, registration, roll verification, roster loading |
| `config.js` | **Your** Supabase URL + anon key go here |
| `schema.sql` | Database table + security rules, pasted into Supabase once |

Data and accounts live in [Supabase](https://supabase.com) (free tier, no credit card). Row Level Security means **only signed-in students can read the roster**; anonymous visitors get nothing.

---

## 1. Create the database (5 minutes)

1. Go to <https://supabase.com>, create a free account and a **New project** (any name/region, pick a database password and keep it).
2. In the project, open **SQL Editor → New query**, paste the whole of [`schema.sql`](schema.sql) and press **Run**. You should see `Success. No rows returned`.

   *Re-running `schema.sql` is always safe* (it only creates or refreshes the same objects), so if you set this project up before the **session** field existed, run it again to pick up the `session` column and the session rule. Students registered before that have no session yet — give them one with the commented `update` line inside `schema.sql`, otherwise they only see other session-less students.
3. Open **Authentication → Providers → Email** and **turn off "Confirm email"**. This site does not use email addresses, so no confirmation mail can ever arrive.
4. Open **Project Settings → API** and copy:
   - **Project URL** → `SUPABASE_URL`
   - **anon public** key → `SUPABASE_ANON_KEY`

Paste both into [`config.js`](config.js) and save.

> Only the `anon` key belongs in a website. Never paste the `service_role` key — it bypasses all security rules.

## 2. Try it locally

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>. Register a student, then log in with the same prof roll number.

## 3. Upload to GitHub and go live

```bash
git init
git add .
git commit -m "SBMCH student roll directory"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/sbmch-directory.git
git push -u origin main
```

(Replace the URL with the repository you created on <https://github.com/new>.)

Then turn on GitHub Pages:

1. On GitHub, open your repository → **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to *Deploy from a branch*, branch **main**, folder **/ (root)** → **Save**.
3. After ~1 minute the site is live at `https://YOUR-USERNAME.github.io/sbmch-directory/`

Every later `git push` to `main` re-publishes the site automatically.

---

## How login works (read this)

Students log in with **their prof roll number** plus **the session they registered
for** — there is no password to type. Under the hood the roll number is hashed
into a username and matched against the account created at registration, and the
chosen session is checked against the stored one.

**Anyone who knows a student's prof roll number can open that student's session.**
That is inherent to roll-number-only login, so treat the directory as a class
resource, not as private data. The roster itself is still protected: you cannot
see it at all without registering first.

`SHARED_PASSPHRASE` in `config.js` is therefore *not* a secret — it is a constant
every account shares, visible in the page source, that only exists because Supabase
Auth requires a password field.

## Managing students

Everything lives in the Supabase **Table Editor → students**:

- To remove a student, delete their row here (and optionally their user under
  **Authentication → Users**).
- The `prof_roll` column has a unique constraint, so a roll number can only be
  registered once.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| "Setup required" banner | Fill in both values in `config.js`. |
| "Turn off email confirmation" after registering | Authentication → Providers → Email → disable **Confirm email**. |
| "No account is registered with that prof roll number" | That roll never completed registration — use the Register tab. |
| "That prof roll number is already registered" | It already exists; log in with it instead. |
| `Could not load the Supabase library` | The CDN was blocked — check the connection / any ad blocker. |
| Roster stays empty | Re-run `schema.sql` and confirm RLS policies exist on the `students` table. |
| Directory shows nobody, or the wrong students | Your record has no `session` (it predates the field) or a different one. In **Table Editor → students**, set your row's `session` to `2022-23`, `2023-24` or `2024-25`. |
