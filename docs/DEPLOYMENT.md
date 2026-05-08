# Ductly Deployment Guide

## Server Details

| Item | Value |
|------|-------|
| Server IP | `136.144.243.31` |
| Plesk URL | `https://136.144.243.31:8443` |
| Plesk Login | `admin` / `XQdv^pD_sp37qeb3` |
| SSH User | `ductly@136.144.243.31` (key-based auth) |
| Domain | `ductly.ae` (Coming Soon page) |
| Staging | `staging.ductly.ae` (Full app) |
| n8n | `https://n8n.ductly.ae` (Workflow automation) |
| App Directory | `/var/www/vhosts/ductly.ae/httpdocs` |
| Node.js | v20 via nvm (`/var/www/vhosts/ductly.ae/.nvm`) |
| Process Manager | pm2 (apps: `ductly`, `n8n`) |
| DNS Registrar | tasjeel.ae |

---

## Deploy Updates (After Code Changes)

Run these commands from the project directory on your local machine:

### 1. Push to GitHub

```bash
git add .
git commit -m "your message"
git push origin main
```

### 2. Pull & Rebuild on Server

```bash
ssh ductly@136.144.243.31 "export NVM_DIR=/var/www/vhosts/ductly.ae/.nvm && . \$NVM_DIR/nvm.sh && cd httpdocs && git pull origin main && npm install && npx next build && pm2 restart ductly"
```

That's it — one command to pull, build, and restart.

### Quick Alias (Optional)

Add this to your `~/.bashrc` or `~/.bash_profile` for a shortcut:

```bash
alias deploy-ductly='ssh ductly@136.144.243.31 "export NVM_DIR=/var/www/vhosts/ductly.ae/.nvm && . \$NVM_DIR/nvm.sh && cd httpdocs && git pull origin main && npm install && npx next build && pm2 restart ductly"'
```

Then just run `deploy-ductly` after pushing to GitHub.

---

## Common Operations

### Check app status
```bash
ssh ductly@136.144.243.31 "export NVM_DIR=/var/www/vhosts/ductly.ae/.nvm && . \$NVM_DIR/nvm.sh && pm2 status"
```

### View app logs
```bash
ssh ductly@136.144.243.31 "export NVM_DIR=/var/www/vhosts/ductly.ae/.nvm && . \$NVM_DIR/nvm.sh && pm2 logs ductly --lines 50"
```

### Restart app (no rebuild)
```bash
ssh ductly@136.144.243.31 "export NVM_DIR=/var/www/vhosts/ductly.ae/.nvm && . \$NVM_DIR/nvm.sh && pm2 restart ductly"
```

### Update environment variables
```bash
ssh ductly@136.144.243.31 "nano /var/www/vhosts/ductly.ae/httpdocs/.env.local"
```
Then restart the app after editing.

---

## n8n (Workflow Automation)

n8n is installed globally via npm and runs as a pm2 process on port 5678. Plesk's Apache reverse proxies `n8n.ductly.ae` to it.

| Item | Value |
|------|-------|
| URL | `https://n8n.ductly.ae` |
| Version | 2.8.4 |
| pm2 name | `n8n` |
| Internal port | 5678 |
| Data directory | `/var/www/vhosts/ductly.ae/.n8n` |
| Timezone | Asia/Dubai |
| Config | `/var/www/vhosts/ductly.ae/n8n-ecosystem.config.js` |

### How it works

- nginx (SSL) → Apache → reverse proxy → n8n on port 5678
- Reverse proxy is configured in Plesk: n8n.ductly.ae → Hosting & DNS → Apache & nginx → "Additional directives for HTTPS"
- Proxy mode is ON (nginx → Apache), Apache handles the ProxyPass to n8n

### n8n Commands

```bash
# View n8n logs
ssh ductly@136.144.243.31 "export NVM_DIR=/var/www/vhosts/ductly.ae/.nvm && . \$NVM_DIR/nvm.sh && pm2 logs n8n --lines 50"

# Restart n8n
ssh ductly@136.144.243.31 "export NVM_DIR=/var/www/vhosts/ductly.ae/.nvm && . \$NVM_DIR/nvm.sh && pm2 restart n8n"

# Update n8n
ssh ductly@136.144.243.31 "export NVM_DIR=/var/www/vhosts/ductly.ae/.nvm && . \$NVM_DIR/nvm.sh && npm update -g n8n && pm2 restart n8n"
```

---

## Go Live (When Ready)

To switch `ductly.ae` from "Coming Soon" to the full app:

```bash
# Via Plesk API — point main domain back to the app
curl -sk -X POST -u "admin:XQdv^pD_sp37qeb3" \
  "https://136.144.243.31:8443/api/v2/cli/domain/call" \
  -H "Content-Type: application/json" \
  -d '{"params":["--update","ductly.ae","-www-root","httpdocs"]}'
```

Then enable Node.js for `ductly.ae` in Plesk UI:
1. Websites & Domains → ductly.ae → Node.js
2. Enable Node.js, set startup file to `server.js`, version `24.15.0`

---

## Architecture

```
Browser → DNS (tasjeel.ae) → Plesk Server (136.144.243.31)
  → nginx (SSL termination)
    → Phusion Passenger (Node.js proxy)
      → Next.js app (server.js, port managed by Passenger)
    → pm2 also running as backup on port 3000
```

- **SSL**: Let's Encrypt (auto-renewing via Plesk)
- **Node.js**: v20.x via nvm (Plesk's built-in Node uses v24 for Passenger)
- **Database**: Supabase (hosted, not on this server)
- **Payments**: Stripe (webhook: `https://staging.ductly.ae/api/webhooks/stripe`)

---

## SSH Key Setup (If Lost)

If you need to reconnect SSH from a new machine:

1. Generate a key: `ssh-keygen -t ed25519`
2. Copy the public key: `cat ~/.ssh/id_ed25519.pub`
3. In Plesk SSH Terminal, run:
   ```
   echo "YOUR_PUBLIC_KEY_HERE" >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys
   ```
4. Test: `ssh ductly@136.144.243.31 "whoami"`

---

## Pending Production Tasks

- [ ] Create admin user in Supabase Dashboard → Authentication → Users
- [ ] Update Stripe webhook URL to `https://ductly.ae/api/webhooks/stripe` (when going live)
- [ ] Run SQL migrations in Supabase SQL editor (`scripts/005_cancellation_reschedule.sql`, etc.)
- [ ] Set up pm2 auto-restart: `pm2 startup` on the server
- [x] Set up n8n — running at `https://n8n.ductly.ae`
- [ ] Configure n8n WhatsApp notification workflows
- [ ] Check Google Maps API key restrictions in Google Cloud Console
