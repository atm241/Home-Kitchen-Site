# Self-hosting (and reaching it from your phone)

This guide covers running Simmer on your own hardware and the two ways to
reach it from your phone when you're not on your home Wi-Fi. Any machine
that runs Docker works. A Raspberry Pi is a good always-on choice, and a Mac
works too, as long as it stays awake. Section 0 is for setting up a Pi;
everything after it applies to any machine.

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

## 1. Running it

The Docker images used by [docker-compose.yml](docker-compose.yml)
(`postgres:16-alpine`, `node:20-alpine`, `nginx:1.27-alpine`) are all official
multi-arch images, so this runs as-is on a 64-bit Raspberry Pi OS (Pi 4 or 5
recommended) with Docker + Docker Compose installed — no changes needed.

```bash
git clone <your fork/repo> simmer
cd simmer
cp .env.example .env
# edit .env and set the four required values:
#   POSTGRES_PASSWORD    database password
#   JWT_SECRET           generate with: openssl rand -base64 48
#   ANTHROPIC_API_KEY    video, photo and receipt imports
#   CLIENT_URL           every address you open the app from, separated by
#                        commas, e.g. http://192.168.1.50:3000 (add the
#                        Tailscale https address later). Requests from any
#                        other address are rejected, so "localhost" here
#                        breaks access from every phone
# docker compose refuses to start if any of these are missing. The optional
# keys (recommendations, Instagram, store prices, AI limits) are listed in
# README.md.
docker compose up -d --build
```

The app is now reachable at `http://<machine-local-ip>:3000` from any device
on your home network. The first person to sign up creates a new household.
Anyone who signs up with that household's invite code (in the Account menu
once logged in) shares the same cookbook, pantry and grocery list.

To update after pulling new code, run `docker compose up -d --build` again.
Database migrations apply automatically when the server starts.

## 2. Reaching it from your phone when you're away from home

A plain `http://` address only works on your home network. To use the app
from your phone out and about, pick one of these:

### Option A: Tailscale (recommended)

[Tailscale](https://tailscale.com) creates a private, encrypted network
between your devices — no port forwarding, no exposing the Pi to the public
internet, and it works from any network your phone is on.

1. Install Tailscale on the host machine and on your phone (App Store / Play
   Store), and sign in to the same account on both.
   - **Pi / Linux:** `curl -fsSL https://tailscale.com/install.sh | sh`, then `sudo tailscale up`.
   - **Mac:** install the Tailscale app (`brew install --cask tailscale`, or
     download it from tailscale.com). The command-line tool is inside the
     app at `/Applications/Tailscale.app/Contents/MacOS/Tailscale`.
2. Enable MagicDNS and HTTPS certificates for your tailnet in the
   [Tailscale admin console](https://login.tailscale.com/admin/dns).
3. Put the app behind [Tailscale Serve](https://tailscale.com/kb/1242/tailscale-serve),
   which provides the HTTPS certificate and renews it on its own:
   ```bash
   tailscale serve --bg --https=443 http://127.0.0.1:3000
   tailscale serve status      # shows https://<machine>.<your-tailnet>.ts.net
   ```
   The first time, it may print a link to approve Serve for your tailnet.
   Open it, approve, and run the command again. Use the explicit form above:
   the shorthand `tailscale serve --bg 3000` fails on some installs. The
   setting survives reboots.
4. Add the new address to `CLIENT_URL` in `.env`, keeping the LAN address,
   e.g. `CLIENT_URL=http://192.168.1.50:3000,https://<machine>.<your-tailnet>.ts.net`.
   Then run `docker compose up -d server`.
5. On your phone, with the Tailscale app connected, open
   `https://<machine>.<your-tailnet>.ts.net`. It works from any network, and
   because it's real HTTPS, "Add to Home Screen" gives you the full
   installable app, including offline mode (see below).

The host has to be on and awake, with Tailscale running. On a Mac, turn on
System Settings → Displays → Advanced → "Prevent automatic sleeping when the
display is off" (or the equivalent under Energy on your macOS version), and
keep it plugged in.

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

It'll behave like a native app, with its own icon and no browser bars. If
you lose signal (say, in the back of the store), the last-loaded grocery
list, recipes and pantry stay readable. Checking items off and other changes
need a connection again.

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
  In the app's folder on the host (over SSH for a Pi), run:

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

## 6. Backups

Your recipes, pantry, and photos live in two Docker volumes on the host's
disk. A failed disk (SD cards are the usual way a Pi deployment dies) or a
`docker compose down -v` destroys them, and `down -v` does it instantly. Set
this up before you have anything you'd be upset to lose.

Two things get backed up, because they live in two different places: a
`pg_dump` of the database, and a tar of the uploads volume. A database dump
does **not** include your recipe photos — restore only one and you get recipes
pointing at images that no longer exist.

### Taking a backup

```bash
cd ~/home-kitchen          # wherever you cloned it
scripts/backup.sh          # writes into backups/
```

Pass a directory to write somewhere else — an external drive or a mounted
network share is a much better home for these than the same SD card you're
protecting against:

```bash
scripts/backup.sh /mnt/usb/kitchen-backups
```

Old backups are pruned after 14 days (`BACKUP_KEEP_DAYS` to change it), and
pruning only happens *after* the new backup is verified, so a failed run can
never delete your last good copy.

### Running it nightly on a Pi / Linux

```bash
crontab -e
```

```cron
0 3 * * * cd /home/pi/simmer && scripts/backup.sh >> backups/backup.log 2>&1
```

### Running it nightly on a Mac

Cron and launchd jobs can't read `~/Documents` (macOS privacy protection
fails them with "Operation not permitted"), so if the repo lives there,
`scripts/backup.sh` can't be scheduled directly. The working setup on this
project's Mac is:

- `~/.simmer/backup.sh`: a standalone copy that talks to the containers by
  name (`homekitchensite-db-1`, `homekitchensite-server-1`, which stay fixed
  because `docker-compose.yml` pins the project name) and writes to
  `~/SimmerBackups`, keeping 14 days.
- `~/Library/LaunchAgents/com.simmer.backup.plist`: runs it at 3 AM. If the
  Mac was asleep at 3 AM, it runs on wake. Output goes to
  `~/SimmerBackups/backup.log`.

Both files are in `scripts/macos/`. To install them on a new Mac, run this
from the repo folder:

```bash
mkdir -p ~/.simmer ~/SimmerBackups
cp scripts/macos/backup.sh ~/.simmer/backup.sh && chmod +x ~/.simmer/backup.sh
sed "s#__HOME__#$HOME#g" scripts/macos/com.simmer.backup.plist > ~/Library/LaunchAgents/com.simmer.backup.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.simmer.backup.plist
```

Useful commands:

```bash
launchctl kickstart gui/$(id -u)/com.simmer.backup   # run a backup now
tail ~/SimmerBackups/backup.log                       # check recent runs
launchctl bootout gui/$(id -u)/com.simmer.backup     # turn the schedule off
```

Either way, the stack must be running, because the script backs up through
the containers. If the database container is down, it exits with an error
rather than writing an empty file, so a silent failure can't pass for a good
backup. Both versions keep backups on the same machine they protect, so copy
one to another drive or to cloud storage now and then.

### Restoring

```bash
scripts/restore.sh backups/db-20260904-030000.sql.gz
scripts/restore.sh ~/SimmerBackups/db-20261117-030000.sql.gz   # Mac nightly backups
```

The matching uploads archive is found automatically next to the database dump.
It asks you to type `restore` first, because this replaces everything.

### Actually test it

A backup nobody has restored isn't a backup. Once, on purpose, restore into
the running stack and confirm your recipes come back. The round trip in this
repo was verified end to end — database wiped, photos deleted, both restored,
login and images working afterwards — but that was on a test stack, not yours.

## 7. Cloud-hosted or paid-hosting-by-you

Because the app is already multi-tenant (accounts + households, added in
[migration 003](server/migrations/003_add_auth_and_households.sql)), the same
Docker images can be deployed to any VPS and serve multiple independent
households from one instance — the foundation for eventually offering this as
a paid-hosting service is already in place. That's a separate step (billing,
terms of service, etc.) or you can host others yourself and just have them
sign up with their own household.

Every household shares the server's Anthropic key, so the daily AI caps
(`AI_DAILY_LIMIT_*`, see [ARCHITECTURE.md](ARCHITECTURE.md)) are what keep
one account from running up the bill.
