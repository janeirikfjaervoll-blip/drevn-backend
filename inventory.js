const router = require('express').Router();
const { requireAuth, requireRole } = require('../middleware/auth');

// Alle inventory-routes krever auth
router.use(requireAuth);

// GET /api/inventory
router.get('/', async (req, res, next) => {
  try {
    const { category, lowStock } = req.query;
    const where = { restaurantId: req.user.restaurantId, active: true };
    if (category) where.category = category;

    let items = await req.prisma.inventoryItem.findMany({
      where,
      include: { supplier: { select: { name: true } } },
      orderBy: { name: 'asc' }
    });

    if (lowStock === 'true') {
      items = items.filter(i => i.stockCurrent <= i.stockMin);
    }

    res.json(items);
  } catch (e) { next(e); }
});

// GET /api/inventory/:id
router.get('/:id', async (req, res, next) => {
  try {
    const item = await req.prisma.inventoryItem.findFirst({
      where: { id: req.params.id, restaurantId: req.user.restaurantId },
      include: {
        supplier: true,
        logs: { orderBy: { createdAt: 'desc' }, take: 20 }
      }
    });
    if (!item) return res.status(404).json({ error: 'Ikke funnet' });
    res.json(item);
  } catch (e) { next(e); }
});

// POST /api/inventory
router.post('/', requireRole('OWNER', 'MANAGER'), async (req, res, next) => {
  try {
    const data = { ...req.body, restaurantId: req.user.restaurantId };
    const item = await req.prisma.inventoryItem.create({ data });
    res.status(201).json(item);
  } catch (e) { next(e); }
});

// PATCH /api/inventory/:id
router.patch('/:id', requireRole('OWNER', 'MANAGER'), async (req, res, next) => {
  try {
    const item = await req.prisma.inventoryItem.findFirst({
      where: { id: req.params.id, restaurantId: req.user.restaurantId }
    });
    if (!item) return res.status(404).json({ error: 'Ikke funnet' });
    const updated = await req.prisma.inventoryItem.update({
      where: { id: req.params.id },
      data: req.body
    });
    res.json(updated);
  } catch (e) { next(e); }
});

// POST /api/inventory/:id/count — varetelling
router.post('/:id/count', async (req, res, next) => {
  try {
    const { qty, note, source } = req.body;
    const item = await req.prisma.inventoryItem.findFirst({
      where: { id: req.params.id, restaurantId: req.user.restaurantId }
    });
    if (!item) return res.status(404).json({ error: 'Ikke funnet' });

    const [updated, log] = await req.prisma.$transaction([
      req.prisma.inventoryItem.update({
        where: { id: req.params.id },
        data: { stockCurrent: parseFloat(qty) }
      }),
      req.prisma.inventoryLog.create({
        data: {
          restaurantId: req.user.restaurantId,
          itemId: req.params.id,
          type: 'COUNT',
          qty: parseFloat(qty),
          note: note || null,
          userId: req.user.userId,
          source: source || 'manual'
        }
      })
    ]);

    res.json({ item: updated, log });
  } catch (e) { next(e); }
});

// GET /api/inventory/:id/logs
router.get('/:id/logs', async (req, res, next) => {
  try {
    const logs = await req.prisma.inventoryLog.findMany({
      where: { itemId: req.params.id, restaurantId: req.user.restaurantId },
      orderBy: { createdAt: 'desc' },
      take: 50
    });
    res.json(logs);
  } catch (e) { next(e); }
});

module.exports = router;
