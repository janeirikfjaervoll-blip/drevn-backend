const router = require('express').Router();
const { requireAuth, requireRole } = require('../middleware/auth');

router.use(requireAuth);

// GET /api/bookings
router.get('/', async (req, res, next) => {
  try {
    const { date, status } = req.query;
    const where = { restaurantId: req.user.restaurantId };
    if (status) where.status = status;
    if (date) {
      const d = new Date(date);
      const next = new Date(d);
      next.setDate(next.getDate() + 1);
      where.date = { gte: d, lt: next };
    }

    const bookings = await req.prisma.booking.findMany({
      where,
      include: { tables: { include: { table: true } } },
      orderBy: [{ date: 'asc' }, { time: 'asc' }]
    });
    res.json(bookings);
  } catch (e) { next(e); }
});

// GET /api/bookings/:id
router.get('/:id', async (req, res, next) => {
  try {
    const booking = await req.prisma.booking.findFirst({
      where: { id: req.params.id, restaurantId: req.user.restaurantId },
      include: { tables: { include: { table: true } } }
    });
    if (!booking) return res.status(404).json({ error: 'Ikke funnet' });
    res.json(booking);
  } catch (e) { next(e); }
});

// POST /api/bookings — ny booking (fra gjesteside eller CRM)
router.post('/', async (req, res, next) => {
  try {
    const { tableIds, ...bookingData } = req.body;
    const data = { ...bookingData, restaurantId: req.user.restaurantId };

    if (tableIds?.length) {
      data.tables = {
        create: tableIds.map(tableId => ({ tableId }))
      };
    }

    const booking = await req.prisma.booking.create({
      data,
      include: { tables: { include: { table: true } } }
    });
    res.status(201).json(booking);
  } catch (e) { next(e); }
});

// PATCH /api/bookings/:id
router.patch('/:id', async (req, res, next) => {
  try {
    const { tableIds, ...rest } = req.body;
    const booking = await req.prisma.booking.findFirst({
      where: { id: req.params.id, restaurantId: req.user.restaurantId }
    });
    if (!booking) return res.status(404).json({ error: 'Ikke funnet' });

    const updated = await req.prisma.booking.update({
      where: { id: req.params.id },
      data: rest,
      include: { tables: { include: { table: true } } }
    });
    res.json(updated);
  } catch (e) { next(e); }
});

// GET /api/bookings/availability — sjekk ledige bord
router.get('/check/availability', async (req, res, next) => {
  try {
    const { date, time, guestCount } = req.query;
    if (!date || !time) return res.status(400).json({ error: 'Mangler dato/tid' });

    const d = new Date(date);
    const next = new Date(d);
    next.setDate(next.getDate() + 1);

    const existingBookings = await req.prisma.booking.findMany({
      where: {
        restaurantId: req.user.restaurantId,
        date: { gte: d, lt: next },
        status: { notIn: ['CANCELLED', 'NO_SHOW'] },
        time: time
      },
      include: { tables: true }
    });

    const occupiedTableIds = existingBookings.flatMap(b => b.tables.map(t => t.tableId));

    const tables = await req.prisma.table.findMany({
      where: {
        restaurantId: req.user.restaurantId,
        active: true,
        seats: { gte: parseInt(guestCount) || 1 },
        id: { notIn: occupiedTableIds }
      },
      include: { zone: true }
    });

    res.json({ available: tables.length > 0, tables });
  } catch (e) { next(e); }
});

module.exports = router;
