const router = require('express').Router();
const { requireAuth, requireRole } = require('../middleware/auth');

router.use(requireAuth);

// GET /api/restaurants/me — egne restaurantdata
router.get('/me', async (req, res, next) => {
  try {
    const restaurant = await req.prisma.restaurant.findUnique({
      where: { id: req.user.restaurantId },
      include: {
        users: { select: { id: true, email: true, name: true, role: true } },
        zones: { include: { tables: true } }
      }
    });
    res.json(restaurant);
  } catch (e) { next(e); }
});

// PATCH /api/restaurants/me
router.patch('/me', requireRole('OWNER'), async (req, res, next) => {
  try {
    const allowed = ['name', 'address', 'phone', 'email', 'primaryColor', 'logoUrl', 'timezone'];
    const data = Object.fromEntries(Object.entries(req.body).filter(([k]) => allowed.includes(k)));
    const updated = await req.prisma.restaurant.update({
      where: { id: req.user.restaurantId },
      data
    });
    res.json(updated);
  } catch (e) { next(e); }
});

// GET /api/restaurants/me/dashboard — nøkkeltall
router.get('/me/dashboard', async (req, res, next) => {
  try {
    const rId = req.user.restaurantId;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [
      inventoryCount,
      lowStockCount,
      bookingsToday,
      openChatSessions,
      pendingOrders
    ] = await Promise.all([
      req.prisma.inventoryItem.count({ where: { restaurantId: rId, active: true } }),
      req.prisma.inventoryItem.count({
        where: { restaurantId: rId, active: true, stockCurrent: { lte: req.prisma.inventoryItem.fields.stockMin } }
      }),
      req.prisma.booking.count({
        where: { restaurantId: rId, date: { gte: today, lt: tomorrow }, status: { notIn: ['CANCELLED', 'NO_SHOW'] } }
      }),
      req.prisma.chatSession.count({ where: { restaurantId: rId, status: 'OPEN' } }),
      req.prisma.order.count({ where: { restaurantId: rId, status: 'NEW' } })
    ]);

    res.json({ inventoryCount, lowStockCount, bookingsToday, openChatSessions, pendingOrders });
  } catch (e) { next(e); }
});

// POST /api/restaurants/onboard — ny restaurant fra onboarding-skjema
router.post('/onboard', async (req, res, next) => {
  try {
    const bcrypt = require('bcryptjs');
    const crypto = require('crypto');
    const jwt = require('jsonwebtoken');

    const {
      restaurantName, orgnr, address, phone,
      contactName, email, password,
      systems // array: ["planday","kasse","levering"]
    } = req.body;

    if (!restaurantName || !email || !password) {
      return res.status(400).json({ error: 'Mangler påkrevde felter' });
    }

    const existing = await req.prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(409).json({ error: 'E-post allerede i bruk' });

    const passwordHash = await bcrypt.hash(password, 12);
    const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

    const restaurant = await req.prisma.restaurant.create({
      data: {
        name: restaurantName,
        orgnr: orgnr || null,
        address: address || null,
        phone: phone || null,
        email: email,
        trialEndsAt,
        users: {
          create: {
            email,
            passwordHash,
            name: contactName || null,
            role: 'OWNER'
          }
        }
      },
      include: { users: true }
    });

    const user = restaurant.users[0];
    const accessToken = jwt.sign(
      { userId: user.id, restaurantId: restaurant.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );
    const refreshToken = crypto.randomBytes(40).toString('hex');

    await req.prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      }
    });

    res.status(201).json({
      accessToken,
      refreshToken,
      restaurantId: restaurant.id,
      restaurantName: restaurant.name,
      trialEndsAt,
      requestedSystems: systems || []
    });
  } catch (e) { next(e); }
});

module.exports = router;
