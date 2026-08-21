# Self-Hosting on a Raspberry Pi (and reaching it from your phone)

This guide covers running Home Kitchen on your own hardware — a Raspberry Pi at
home is the reference setup — and the two ways to reach it from your phone
when you're not on your home Wi-Fi.

## 0. First-time Pi setup (flash the OS, enable SSH, install Docker)

If your Pi doesn't have an OS on it yet:

1. On your Mac, install [Raspberry Pi Imager](https://www.raspberrypi.com/software/) and insert the Pi's SD card (or SSD if booting from USB).
2. Open Imager → choose **Raspberry Pi OS Lite (64-bit)** (no desktop needed, this app is headless) → choose your SD card.
3. Click the gear icon (⚙️) / "Edit Settings" before writing — this is the important part, it lets you skip ever plugging in a keyboard/monitor:
   - Set a hostname (e.g. `homekitchen`)
   - Enable SSH, "Use password authentication"
   - Set a username/password
   - Set your Wi-Fi SSID/password (if not using Ethernet)
4. Write the image, then put the SD card in the Pi and power it on. Give it about a minute to boot and join your network.
5. From your Mac's terminal: `ssh <username>@<hostname>.local` (e.g. `ssh pierce@homekitchen.local`). If that hostname doesn't resolve, check your router's connected-devices list for its IP and use that instead.
6. Install Docker on the Pi:
   ```bash
   curl -fsSL https://get.docker.com | sh
   sudo usermod -aG docker $USER
   ```
   Log out and back in (`exit`, then SSH in again) for the group change to take effect.
7. Verify: `docker run hello-world` should succeed.

Once you're SSH'd into the Pi with Docker working, tell me and I can walk
through (or directly run, if you'd like) the rest of the steps below over
that same SSH connection.

## 1. Running it on the Pi

The Docker images used by [docker-compose.yml](docker-compose.yml)
(`postgres:16-alpine`, `node:20-alpine`, `nginx:1.27-alpine`) are all official
multi-arch images, so this runs as-is on a 64-bit Raspberry Pi OS (Pi 4 or 5
recommended) with Docker + Docker Compose installed — no changes needed.

```bash
git clone <your fork/repo> home-kitchen
cd home-kitchen
cp .env.example .env
# edit .env and set all five required values:
#   POSTGRES_PASSWORD    database password
#   ANTHROPIC_API_KEY    recipe photo import / receipt scanning
#   JWT_SECRET           generate with: openssl rand -base64 48
#   SPOONACULAR_API_KEY  recipe + ingredient-combo recommendations
#   CLIENT_URL           the address you open the app from, e.g.
#                        http://192.168.1.50:3000 — this is the CORS origin,
#                        so "localhost" here breaks access from every phone
# The server refuses to start if any are missing, rather than booting into a
# half-broken state where recommendations silently return nothing.
docker compose up -d
```

The app is now reachable at `http://<pi-local-ip>:3000` from any device on
your home network. The first person to sign up becomes the owner of a new
household; anyone else who signs up with that household's invite code (visible
in the "My Household" menu once logged in) shares the same pantry, recipes,
and grocery list.

## 2. Reaching it from your phone when you're away from home

A plain `http://` address only works on your home network. To use the app
from your phone out and about, pick one of these:

### Option A: Tailscale (recommended)

[Tailscale](https://tailscale.com) creates a private, encrypted network
between your devices — no port forwarding, no exposing the Pi to the public
internet, and it works from any network your phone is on.

1. Install Tailscale on the Pi (`curl -fsSL https://tailscale.com/install.sh | sh`, then `tailscale up`) and on your phone (App Store / Play Store), signing in with the same account.
2. Enable HTTPS for your tailnet in the [Tailscale admin console](https://login.tailscale.com/admin/dns) (DNS → "HTTPS Certificates").
3. On the Pi, run `tailscale cert <pi-name>.<your-tailnet>.ts.net` to get a real HTTPS certificate, then point nginx at it (or run [Tailscale serve](https://tailscale.com/kb/1242/tailscale-serve): `tailscale serve https / http://localhost:3000`, which handles the TLS termination for you with zero nginx changes).
4. On your phone, open `https://<pi-name>.<your-tailnet>.ts.net` — this works from any network, and because it's real HTTPS, "Add to Home Screen" gets you the full installable PWA experience (see below).

This is the setup this app was built for: nothing is exposed to the public
internet, so there's no attack surface to harden beyond your own account
password.

### Option B: Reverse proxy + a real domain

If you'd rather have a normal public URL (e.g. for cloud hosting other
people, not just yourself), put a reverse proxy in front that handles HTTPS:

- [Caddy](https://caddyhq.com) is the simplest option — point a domain's DNS
  at your public IP (or use a dynamic DNS service like
  [DuckDNS](https://www.duckdns.org) if your ISP doesn't give you a static
  one), forward ports 80/443 on your router to the Pi, and Caddy will get and
  renew a Let's Encrypt certificate automatically.
- This exposes the Pi to the internet. Keep Docker/the OS patched, use a
  strong `POSTGRES_PASSWORD` and `JWT_SECRET`, and rely on the app's
  household-scoped accounts for isolation if you ever host other people this
  way.

## 3. Installing it as an app on your phone (PWA)

Once you're reaching the site over **HTTPS** (either Tailscale's cert or a
real domain — plain HTTP over a local IP won't do this):

- **iPhone (Safari)**: open the site → Share icon → "Add to Home Screen".
- **Android (Chrome)**: open the site → ⋮ menu → "Install app" (or "Add to
  Home Screen").

It'll behave like a native app — its own icon, no browser chrome — and the
app shell (everything except live pantry/recipe data, which always needs a
live connection) keeps working if your connection drops mid-session.

## 4. Forgotten passwords

There's no emailed reset link — that would mean running an SMTP server for a
household of two or three people. Instead:

- **Someone else in the household is logged in** (the normal case): they open
  the account menu → **Reset a member's password**, pick the person, and set a
  new one. They confirm with their own password, so an unlocked phone left on
  the counter can't be used to lock someone out of their own account. This
  grants no access they didn't already have — household members share all the
  same data by design.

- **Everyone is locked out at once**: this can only be fixed on the server.
  SSH to the Pi and run:

  ```bash
  docker compose exec server npm run reset-password -- you@example.com new-password
  ```

  The new password must be at least 8 characters. Change it from inside the app
  afterwards so it isn't left sitting in your shell history.

## 5. Updating the app

The app is installable as a PWA, which means a browser tab can keep serving a
cached older build after you deploy. When a new version is detected, a banner
appears offering to refresh. If you're testing a change and don't see it, use
that banner (or fully close and reopen the app) rather than assuming the
deploy failed.

## 6. Cloud-hosted or paid-hosting-by-you

Because the app is already multi-tenant (accounts + households, added in
[migration 003](server/migrations/003_add_auth_and_households.sql)), the same
Docker images can be deployed to any VPS and serve multiple independent
households from one instance — the foundation for eventually offering this as
a paid-hosting service is already in place. That's a separate step (billing,
terms of service, etc.) or you can host others yourself and just have them
sign up with their own household.
