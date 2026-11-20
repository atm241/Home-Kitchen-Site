# Self-hosting (and reaching it from your phone)

This guide covers running Simmer on your own hardware and the two ways to
reach it from your phone when you're not on your home Wi-Fi. Any machine
that runs Docker works. A Raspberry Pi is a good always-on choice, and a Mac
works too, as long as it stays awake. Section 0 is for setting up a Pi;
everything after it applies to any machine. On Proxmox, start with section 8.

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
(`postgres:16-alpine`, `node:24-alpine`, `nginx:1.27-alpine`) are all official
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

`scripts/linux/setup-server.sh` adds this entry for you. Cron uses the
machine's time zone, which is UTC on a fresh Ubuntu install. Set yours with
`sudo timedatectl set-timezone America/Denver` (or your zone) so "3 AM"
means 3 AM.

### Running it nightly on a Mac

Cron and launchd jobs can't read `~/Documents` (macOS privacy protection
fails them with "Operation not permitted"), so if the repo lives there,
`scripts/backup.sh` can't be scheduled directly. The working setup on this
project's Mac is:

- `~/.simmer/backup.sh`: a standalone copy that talks to the containers by
  name (`homekitchensite-db-1`, `homekitchensite-server-1`, which stay fixed
  because `docker-compose.yml` pins the project name) and writes to
  `~/SimmerBackups`, keeping 14 days.
- `~/Library/LaunchAgents/com.simmer.backup.plist`: runs it at 4:30 AM. If
  the Mac was asleep then, it runs on wake. Output goes to
  `~/SimmerBackups/backup.log`.
- `~/.simmer/backup.env` (optional): settings for the two features below.

**Pull mode.** Once the app runs on a different server, the Mac becomes the
off-machine copy. Add `SIMMER_SERVER=you@server-name` to
`~/.simmer/backup.env`. Each night the script then copies the server's newest
backup pair into `~/SimmerBackups` (kept 30 days) instead of backing up local
containers. It fails, and alerts you if monitoring is set up, when the
server's newest backup is more than 36 hours old. It runs at 4:30 so it never
copies a file the server's 3 AM job is still writing. ssh must log in without
a prompt; see "Off-machine backups" in section 8.

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
backup.

### Getting told when a backup fails

A failed backup only writes to a log file nobody reads. To get an email
instead, create a free check at [healthchecks.io](https://healthchecks.io)
(daily schedule, a few hours' grace) and set its ping URL as
`BACKUP_PING_URL`: in `.env` for `scripts/backup.sh`, or in
`~/.simmer/backup.env` for the Mac script. Each successful run pings the
URL, and each failure pings `URL/fail`. If no ping arrives at all (the
machine is off, or cron broke), healthchecks.io alerts you too.

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

## 8. Running on Proxmox, and moving to a new server

### The VM

Run Simmer in a regular VM rather than an LXC container. Docker inside an
unprivileged LXC needs nesting and keyctl tweaks and breaks in odd ways; a
VM just works. Recommended settings in Proxmox's "Create VM":

| Setting | Value |
|---|---|
| OS | Ubuntu Server 24.04 LTS ISO. During install, pick "OpenSSH server" and set the hostname (e.g. `simmer`); it becomes the Tailscale name |
| CPU | 2 cores, type `host` |
| Memory | 4 GB (Simmer uses well under 1 GB; the rest is headroom for builds) |
| Disk | 32 GB, VirtIO SCSI. Thin-provisioned, so it only uses what's written |
| Network | VirtIO on `vmbr0` (your LAN bridge) |
| Options | **Start at boot**: on. **QEMU Guest Agent**: on |

Two Proxmox-level extras worth turning on:

- **VM backups:** Datacenter → Backup → Add, weekly, mode "Snapshot". This
  copies the whole VM. It's a good second layer, but if it's stored on the
  same disk it doesn't replace off-machine copies.
- **Disk health:** the host → Disks shows SMART status. With a single
  spinning disk, check it now and then. A "FAILED" or growing reallocated
  sector count means it's time to replace the drive.

### Setting up the VM

SSH in (`ssh you@<vm-ip>`), then:

```bash
git clone https://github.com/<you>/<repo>.git ~/simmer
cd ~/simmer && scripts/linux/setup-server.sh
sudo timedatectl set-timezone America/Denver    # your zone, so 3 AM backups mean 3 AM
```

The script installs updates, automatic security updates, the guest agent,
Docker and Tailscale (open the link it prints to log in), and schedules the
nightly backup. A private GitHub repo needs `gh auth login` or a personal
access token for the clone.

### Moving the data (from the old machine)

Do these in order. Between steps 3 and 6 the app is offline, which takes a
few minutes.

1. **Copy `.env` to the new machine.** From the repo folder on the old
   machine: `scp .env you@<vm-ip>:~/simmer/.env`. On the new machine, set
   `CLIENT_URL` to its own addresses, e.g.
   `CLIENT_URL=http://<vm-lan-ip>:3000,https://simmer.<your-tailnet>.ts.net`.
2. **Start the new stack** (empty for now): `cd ~/simmer && docker compose up -d --build`.
3. **Take a final backup on the old machine and stop it**, so nothing is
   written after the backup. On a Mac: `launchctl kickstart gui/$(id -u)/com.simmer.backup`,
   then `docker compose stop` in the repo folder. Use `stop`, never
   `down -v`: the old volumes stay as a fallback.
4. **Copy that backup pair over:**
   `scp ~/SimmerBackups/db-<stamp>.sql.gz ~/SimmerBackups/uploads-<stamp>.tar.gz you@<vm-ip>:~/simmer/backups/`
5. **Restore on the new machine:**
   `scripts/restore.sh backups/db-<stamp>.sql.gz` (type `restore`), then
   `docker compose restart server`.
6. **Serve it over Tailscale:** `sudo tailscale serve --bg --https=443 http://127.0.0.1:3000`.
   Open the new `https://simmer.<your-tailnet>.ts.net` address, log in, and
   check your recipes are there.
7. **Retire the old address.** On the Mac:
   `/Applications/Tailscale.app/Contents/MacOS/Tailscale serve reset`. On your
   phone, delete the old home-screen icon and add the new address
   (Share → Add to Home Screen).

### Off-machine backups

The new machine backs itself up nightly to `~/simmer/backups`, which is on
the same disk. To keep a copy elsewhere, switch the Mac's nightly job to pull
mode (section 6):

```bash
# on the Mac, once:
[ -f ~/.ssh/id_ed25519 ] || ssh-keygen -t ed25519 -N "" -f ~/.ssh/id_ed25519
ssh-copy-id you@simmer                      # Tailscale name of the VM
ssh -o BatchMode=yes you@simmer true && echo "key login works"
echo 'SIMMER_SERVER=you@simmer' >> ~/.simmer/backup.env
launchctl kickstart gui/$(id -u)/com.simmer.backup && tail -2 ~/SimmerBackups/backup.log
```

The last line should say `OK pulled db-...`. From then on, the newest server
backup lands on the Mac every night at 4:30 (or when it next wakes). Add
`BACKUP_PING_URL` on both machines to be told when either side stops.
