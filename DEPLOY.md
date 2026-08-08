# Deployment Package

This directory is the deployable runtime package.

## Server Steps

```bash
npm --prefix system/server install --omit=dev
npm run build:site
PORT=3000 HOST=0.0.0.0 NODE_ENV=production npm start
```

## Runtime Data

- `html/` is generated on the server by `npm run build:site`.
- `data/site.sqlite` is runtime data and is not included in this package.
- For a fresh server, initialize or restore the database before generating HTML.
```bash
npm run db:init
npm run admin:create -- admin your-password
```
