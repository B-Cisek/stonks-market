# Nuxt Minimal Starter

Look at the [Nuxt documentation](https://nuxt.com/docs/getting-started/introduction) to learn more.

## Setup

Make sure to install dependencies:

```bash
# npm
npm install

# pnpm
pnpm install

# yarn
yarn install

# bun
bun install
```

## Development Server

Start the development server on `http://localhost:3000`:

```bash
# npm
npm run dev

# pnpm
pnpm dev

# yarn
yarn dev

# bun
bun run dev
```

## Production

Build the application for production:

```bash
# npm
npm run build

# pnpm
pnpm build

# yarn
yarn build

# bun
bun run build
```

Locally preview production build:

```bash
# npm
npm run preview

# pnpm
pnpm preview

# yarn
yarn preview

# bun
bun run preview
```

Check out the [deployment documentation](https://nuxt.com/docs/getting-started/deployment) for more information.

## Deploy (Docker + GHCR + Traefik)

Każdy push na `main` uruchamia `.github/workflows/deploy.yml`: buduje obraz z `Dockerfile`, wypycha go do
`ghcr.io/<owner>/stonks-market:sha-<commit>` (oraz `:latest`), wgrywa `deploy/docker-compose.yml` na VPS
i robi `docker compose pull && up -d`. Ręcznie można go odpalić z zakładki Actions (`workflow_dispatch`).

### Jednorazowy setup

**VPS**
```bash
sudo adduser --disabled-password deploy && sudo usermod -aG docker deploy
sudo mkdir -p /opt/stonks-market && sudo chown deploy: /opt/stonks-market
# jako deploy:
nano /opt/stonks-market/.env   # treść wg deploy/.env.example, uzupełnij wartości
echo <PAT z read:packages> | docker login ghcr.io -u <github-user> --password-stdin
```
Wartości `TRAEFIK_NETWORK`, `TRAEFIK_ENTRYPOINT` i `TRAEFIK_CERTRESOLVER` muszą pasować do istniejącego
Traefika (`docker network ls`, konfiguracja Traefika).

**Klucz SSH dla CI**
```bash
ssh-keygen -t ed25519 -f deploy_key -N "" -C github-actions
# deploy_key.pub → /home/deploy/.ssh/authorized_keys na VPS
```

**Sekrety repo** (Settings → Secrets and variables → Actions):
| Sekret | Wartość |
|---|---|
| `SSH_HOST` | IP/host VPS |
| `SSH_KEY` | zawartość `deploy_key` (prywatny) |
| `SSH_KNOWN_HOSTS` | wynik `ssh-keyscan -p <port> <SSH_HOST>` |
| `SSH_USER` | opcjonalnie, domyślnie `deploy` |
| `SSH_PORT` | opcjonalnie, domyślnie `22` |

### Rollback
```bash
cd /opt/stonks-market
echo IMAGE_TAG=sha-<poprzedni> > .deploy.env
docker compose --env-file .env --env-file .deploy.env up -d
```

### Lokalny test obrazu
```bash
docker build -t stonks-market .
docker run --rm -p 3000:3000 -e NUXT_BETTER_AUTH_SECRET=$(openssl rand -base64 32) stonks-market
```
