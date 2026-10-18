require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const app = express();

// ─── Middleware ────────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Legg prisma på req så routes kan bruke den
app.use((req, res, next) => {
  req.prisma = prisma;
  next();
});

// ─── Routes ────────────────────────────────────────────────────────────────
app.use('/api/auth',       require('./routes/auth'));
app.use('/api/restaurants',require('./routes/restaurants'));
app.use('/api/inventory',  require('./routes/inventory'));
app.use('/api/recipes',    require('./routes/recipes'));
app.use('/api/shifts',     require('./routes/shifts'));
app.use('/api/employees',  require('./routes/employees'));
app.use('/api/orders',     require('./routes/orders'));
app.use('/api/bookings',   require('./routes/bookings'));
app.use('/api/chat',       require('./routes/chat'));
app.use('/api/invoices',   require('./routes/invoices'));
app.use('/api/voice',      require('./routes/voice'));

// ─── Health check ──────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

// ─── 404 ───────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Ikke funnet' });
});

// ─── Feilhåndtering ────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Serverfeil' });
});

// ─── Start ─────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Drevn backend kjører på port ${PORT}`);
});

module.exports = { app, prisma };
