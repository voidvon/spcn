# Deployment Package

This directory is the deployable runtime package.

## Server Steps

```bash
npm --prefix system/server ci --omit=dev --legacy-peer-deps --no-audit --no-fund
npm run build:site
PORT=4445 HOST=0.0.0.0 NODE_ENV=production npm start
```

## Script Deployment

The deployment script builds `dist/`, synchronizes it to the server, installs server dependencies, and restarts the service:

```bash
./scripts/deploy.sh
```

To deploy the local SQLite database too, use a consistent SQLite snapshot:

```bash
./scripts/deploy.sh --data
```

`--data` backs up the current remote database before replacing it. Add `--build-site` when the uploaded data should also regenerate `html/`. Run `./scripts/deploy.sh --help` to override the host, directory, runtime manager, database path, backup retention, or health-check URL.

## Runtime Data

- `html/` is generated on the server by `npm run build:site`.
- `data/site.sqlite` is runtime data and is not included in this package.
- For a fresh server, initialize or restore the database before generating HTML.
```bash
npm run db:init
npm run admin:create -- admin your-password
```

## Version And Online Updates

- Build a local release package with `npm run release:prepare`.
- Publish a GitHub Release with `npm run release`; this requires an `origin` remote and authenticated GitHub CLI.
- The updater defaults to repository `voidvon/spiraxsarcocn.com` and asset prefix `spiraxsarcocn`.
- Override these with `CMS_RELEASE_REPOSITORY=owner/repository` and `CMS_RELEASE_ASSET_PREFIX=prefix` when deploying elsewhere.
- Online updates preserve `data/`, `html/`, uploads, `.env*`, `.deploy/`, and `.updates/`, verify SHA256, and restart the Node service after installation.
