const router = require('express').Router();
const { requireAuth, requireRole } = require('../middleware/auth');

router.use(requireAuth);

// GET /api/employees
router.get('/', async (req, res, next) => {
  try {
    const employees = await req.prisma.employee.findMany({
      where: { restaurantId: req.user.restaurantId, active: true },
      orderBy: { firstName: 'asc' }
    });
    res.json(employees);
  } catch (e) { next(e); }
});

// POST /api/employees
router.post('/', requireRole('OWNER', 'MANAGER'), async (req, res, next) => {
  try {
    const emp = await req.prisma.employee.create({
      data: { ...req.body, restaurantId: req.user.restaurantId }
    });
    res.status(201).json(emp);
  } catch (e) { next(e); }
});

// PATCH /api/employees/:id
router.patch('/:id', requireRole('OWNER', 'MANAGER'), async (req, res, next) => {
  try {
    const emp = await req.prisma.employee.findFirst({
      where: { id: req.params.id, restaurantId: req.user.restaurantId }
    });
    if (!emp) return res.status(404).json({ error: 'Ikke funnet' });
    const updated = await req.prisma.employee.update({
      where: { id: req.params.id },
      data: req.body
    });
    res.json(updated);
  } catch (e) { next(e); }
});

module.exports = router;
