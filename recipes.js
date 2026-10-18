const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

// GET /api/recipes
router.get('/', async (req, res, next) => {
  try {
    const recipes = await req.prisma.recipe.findMany({
      where: { restaurantId: req.user.restaurantId, active: true },
      include: { ingredients: { include: { item: true } } },
      orderBy: { name: 'asc' }
    });

    // Beregn kostnad per rett
    const withCost = recipes.map(r => {
      const cost = r.ingredients.reduce((sum, ri) => {
        return sum + (ri.item.pricePerUnit || 0) * ri.qty;
      }, 0);
      const margin = r.sellingPrice ? ((r.sellingPrice - cost) / r.sellingPrice * 100) : null;
      return { ...r, cost: Math.round(cost * 100) / 100, margin: margin ? Math.round(margin) : null };
    });

    res.json(withCost);
  } catch (e) { next(e); }
});

// POST /api/recipes
router.post('/', async (req, res, next) => {
  try {
    const { ingredients, ...recipeData } = req.body;
    const recipe = await req.prisma.recipe.create({
      data: {
        ...recipeData,
        restaurantId: req.user.restaurantId,
        ingredients: ingredients?.length ? { create: ingredients } : undefined
      },
      include: { ingredients: { include: { item: true } } }
    });
    res.status(201).json(recipe);
  } catch (e) { next(e); }
});

// PATCH /api/recipes/:id
router.patch('/:id', async (req, res, next) => {
  try {
    const recipe = await req.prisma.recipe.findFirst({
      where: { id: req.params.id, restaurantId: req.user.restaurantId }
    });
    if (!recipe) return res.status(404).json({ error: 'Ikke funnet' });

    const { ingredients, ...rest } = req.body;
    const updated = await req.prisma.recipe.update({
      where: { id: req.params.id },
      data: rest,
      include: { ingredients: { include: { item: true } } }
    });
    res.json(updated);
  } catch (e) { next(e); }
});

module.exports = router;
