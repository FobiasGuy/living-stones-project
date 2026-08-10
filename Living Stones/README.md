# Living Stones Project — deploy guide

## 1. Set up the database (5 min)

1. Open your Supabase project → **SQL Editor** → **New query**.
2. Open `supabase/schema.sql` from this folder, copy all of it, paste it in, click **Run**.
   This creates every table, locks them down with Row Level Security, and adds the
   `place_order` function that safely handles checkout.
3. Go to **Authentication → Sign In / Providers → Email** and turn **off** "Confirm email".
   Accounts here use a generated e-mail address behind the scenes (so customers only
   ever see a username), and it can never receive a real confirmation link.

## 2. Run it locally (optional, but good for testing before you deploy)

```bash
npm install
cp .env.example .env
npm run dev
```

Opens at `http://localhost:5173`. `.env.example` already has your project's URL and
publishable key filled in — both are safe to expose client-side, they only work
within the limits of the database rules in `schema.sql`.

## 3. Push to GitHub

1. github.com → **New repository** → name it `living-stones-project` → Create.
2. On the empty repo page, click **"uploading an existing file"**.
3. Drag in everything from this folder (Chrome/Edge let you drop the whole folder at
   once and it keeps the structure). Commit.

## 4. Deploy on Netlify

1. netlify.com → **Add new site → Import an existing project → GitHub** → pick the repo.
2. Build command and publish directory are already set via `netlify.toml` — leave them.
3. **Before deploying**, go to **Site settings → Environment variables** and add:
   - `VITE_SUPABASE_URL` = `https://fwnemjepfmncqjwmhrbd.supabase.co`
   - `VITE_SUPABASE_PUBLISHABLE_KEY` = `sb_publishable_anWH68E5wzqNL6WcMZSV6Q_hetY8jvW`
   (These aren't committed to GitHub — `.env` is gitignored — so this step is required.)
4. **Deploy site**. A minute later it's live at `something.netlify.app`.
5. Rename the subdomain anytime under **Site settings → Site details → Change site name**.

## 5. Test it live

- Sign up an account.
- Type the admin phrase into the search bar → you become **Owner** (first time only).
- Add a product under Admin → Products so the shop isn't empty.
- Place a test order, then walk it through the status stages as the admin.

## What changed from the prototype

- Passwords are now hashed properly by Supabase Auth, not a homemade client-side hash.
- "My Orders" / "My Requests" privacy is enforced by the database itself (Row Level
  Security), not just filtered in the UI.
- Checkout runs through a single database function (`place_order`) so stock can't go
  negative if two people order the last item at the same moment.
