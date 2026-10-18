require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const app = express();

// —— Middleware ————————————————————————————————————
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

// —— Routes ————————————————————————————————————————
app.use('/api/auth',        require('./auth (1)'));
app.use('/api/restaurants', require('./restaurants'));
app.use('/api/inventory',   require('./inventory'));
app.use('/api/recipes',     require('./recipes'));
app.use('/api/shifts',      require('./shifts'));
app.use('/api/employees',   require('./employees'));
app.use('/api/orders',      require('./orders'));
app.use('/api/bookings',    require('./bookings'));
app.use('/api/invoices',    require('./invoices'));
app.use('/api/voice',       require('./voice'));
app.use('/api/chat',        require('./chat'));

// —— Health check ——————————————————————————————————
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// —— Start server ——————————————————————————————————
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Drevn API kjører på port ${PORT}`);
});
