const router = require('express').Router();
const { requireAuth, requireRole } = require('../middleware/auth');

router.use(requireAuth);

// GET /api/orders
router.get('/', async (req, res, next) => {
  try {
    const { status, source } = req.query;
    const where = { restaurantId: req.user.restaurantId };
    if (status) where.status = status;
    if (source) where.source = source;

    const orders = await req.prisma.order.findMany({
      where,
      include: { items: true },
      orderBy: { receivedAt: 'desc' },
      take: 100
    });
    res.json(orders);
  } catch (e) { next(e); }
});

// POST /api/orders
router.post('/', async (req, res, next) => {
  try {
    const { items, ...orderData } = req.body;
    const order = await req.prisma.order.create({
      data: {
        ...orderData,
        restaurantId: req.user.restaurantId,
        items: items?.length ? { create: items } : undefined
      },
      include: { items: true }
    });
    res.status(201).json(order);
  } catch (e) { next(e); }
});

// PATCH /api/orders/:id/status
router.patch('/:id/status', async (req, res, next) => {
  try {
    const { status } = req.body;
    const order = await req.prisma.order.findFirst({
      where: { id: req.params.id, restaurantId: req.user.restaurantId }
    });
    if (!order) return res.status(404).json({ error: 'Ikke funnet' });
    const updated = await req.prisma.order.update({
      where: { id: req.params.id },
      data: { status }
    });
    res.json(updated);
  } catch (e) { next(e); }
});

module.exports = router;
