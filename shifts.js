const router = require('express').Router();
const { requireAuth, requireRole } = require('../middleware/auth');

router.use(requireAuth);

// GET /api/shifts
router.get('/', async (req, res, next) => {
  try {
    const { week, employeeId } = req.query;
    const where = { restaurantId: req.user.restaurantId };
    if (employeeId) where.employeeId = employeeId;
    if (week) {
      const start = new Date(week);
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      where.date = { gte: start, lt: end };
    }

    const shifts = await req.prisma.shift.findMany({
      where,
      include: { employee: true },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }]
    });
    res.json(shifts);
  } catch (e) { next(e); }
});

// POST /api/shifts
router.post('/', requireRole('OWNER', 'MANAGER'), async (req, res, next) => {
  try {
    const shift = await req.prisma.shift.create({
      data: { ...req.body, restaurantId: req.user.restaurantId },
      include: { employee: true }
    });
    res.status(201).json(shift);
  } catch (e) { next(e); }
});

// PATCH /api/shifts/:id
router.patch('/:id', requireRole('OWNER', 'MANAGER'), async (req, res, next) => {
  try {
    const shift = await req.prisma.shift.findFirst({
      where: { id: req.params.id, restaurantId: req.user.restaurantId }
    });
    if (!shift) return res.status(404).json({ error: 'Ikke funnet' });
    const updated = await req.prisma.shift.update({
      where: { id: req.params.id },
      data: req.body,
      include: { employee: true }
    });
    res.json(updated);
  } catch (e) { next(e); }
});

// DELETE /api/shifts/:id
router.delete('/:id', requireRole('OWNER', 'MANAGER'), async (req, res, next) => {
  try {
    await req.prisma.shift.deleteMany({
      where: { id: req.params.id, restaurantId: req.user.restaurantId }
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// POST /api/shifts/publish — publiser vakter for en uke
router.post('/publish', requireRole('OWNER', 'MANAGER'), async (req, res, next) => {
  try {
    const { week } = req.body;
    const start = new Date(week);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);

    await req.prisma.shift.updateMany({
      where: {
        restaurantId: req.user.restaurantId,
        date: { gte: start, lt: end }
      },
      data: { published: true }
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
