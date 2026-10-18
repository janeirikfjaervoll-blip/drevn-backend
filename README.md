# Drevn.ai Backend

Node.js/Express + Prisma + PostgreSQL. Deployes på Railway.

## Oppsett lokalt

```bash
npm install
cp .env.example .env
# Fyll inn DATABASE_URL, JWT_SECRET, ANTHROPIC_API_KEY

npx prisma db push       # opprett tabeller
npm run dev              # start med nodemon
```

## Deploy til Railway

1. Opprett nytt prosjekt på railway.app
2. Legg til PostgreSQL-tjeneste
3. Koble GitHub-repo
4. Sett miljøvariabler (se .env.example)
5. Railway kjører `npm start` automatisk

## API-endepunkter

| Method | Path | Auth | Beskrivelse |
|--------|------|------|-------------|
| POST | /api/auth/register | Nei | Ny restaurant + owner |
| POST | /api/auth/login | Nei | Login |
| POST | /api/auth/refresh | Nei | Forny access token |
| POST | /api/restaurants/onboard | Nei | Onboarding-flyt fra skjema |
| GET | /api/restaurants/me | Ja | Egne restaurantdata |
| GET | /api/restaurants/me/dashboard | Ja | Nøkkeltall |
| GET | /api/inventory | Ja | Varelager |
| POST | /api/inventory/:id/count | Ja | Varetelling |
| GET | /api/chat/sessions | Ja | CRM-innboks |
| POST | /api/chat/send | Nei | Fra widget (gjest) |
| GET | /api/chat/poll/:id | Nei | Polling fra widget |
| POST | /api/chat/suggest | Ja | AI-svarforslag |
| GET | /api/bookings | Ja | Bookinger |
| GET | /api/bookings/check/availability | Ja | Ledig kapasitet |
| GET | /api/shifts | Ja | Vaktplan |
| POST | /api/voice/transcribe | Ja | Tale → varetelling |
| POST | /api/voice/camera | Ja | Bilde → varetelling |
| POST | /api/invoices/ehf | Ja | EHF XML-import |

## Mappestruktur

```
src/
  index.js          — Express-app, middleware, routes
  middleware/
    auth.js         — JWT-verifisering, rolle-sjekk
  routes/
    auth.js         — register, login, refresh, logout
    restaurants.js  — /me, dashboard, onboard
    inventory.js    — CRUD + varetelling
    chat.js         — CRM + widget-API
    bookings.js     — booking + tilgjengelighet
    shifts.js       — vaktplan
    employees.js    — ansatte
    orders.js       — bestillinger
    recipes.js      — retter + kostnadskalkulator
    invoices.js     — EHF XML-import
    voice.js        — Google Speech + Claude Vision
prisma/
  schema.prisma     — Datamodell (multi-tenant)
```
