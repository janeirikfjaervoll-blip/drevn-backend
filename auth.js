const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const ACCESS_EXPIRES = '15m';
const REFRESH_EXPIRES = '30d';

function signAccess(user) {
  return jwt.sign(
    { userId: user.id, restaurantId: user.restaurantId, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: ACCESS_EXPIRES }
  );
}

// GET /api/auth/check-orgnr — sjekk om orgnr er ledig (brukes i steg 1 av onboarding)
router.get('/check-orgnr', async (req, res, next) => {
  try {
    const { orgnr } = req.query;
    if (!orgnr) return res.status(400).json({ error: 'Mangler orgnr' });
    const clean = orgnr.replace(/\s/g, '');
    const existing = await req.prisma.restaurant.findFirst({ where: { orgnr: clean } });
    if (existing) return res.status(409).json({ error: 'Org.nummeret er allerede registrert' });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// POST /api/auth/register — opprett restaurant + owner-bruker
router.post('/register', async (req, res, next) => {
  try {
    const { restaurantName, orgnr, email, password, name } = req.body;
    if (!restaurantName || !email || !password) {
      return res.status(400).json({ error: 'Mangler påkrevde felter' });
    }
    // Normaliser orgnr (fjern mellomrom)
    const cleanOrgnr = orgnr ? orgnr.replace(/\s/g, '') : null;

    // Sjekk om orgnr allerede er registrert
    if (cleanOrgnr) {
      const existingRestaurant = await req.prisma.restaurant.findFirst({
        where: { orgnr: cleanOrgnr }
      });
      if (existingRestaurant) return res.status(409).json({ error: 'Dette org.nummeret er allerede registrert i Drevn' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

    // Sjekk om e-post allerede er i bruk
    const existingUser = await req.prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(409).json({ error: 'E-postadressen er allerede registrert. Logg inn og legg til ny restaurant derfra.' });
    }

    // Opprett ny restaurant + bruker
    const restaurant = await req.prisma.restaurant.create({
      data: {
        name: restaurantName,
        orgnr: cleanOrgnr || null,
        trialEndsAt,
        users: {
          create: { email, passwordHash, name: name || null, role: 'OWNER', active: true }
        }
      },
      include: { users: true }
    });

    const user = restaurant.users[0];
    const accessToken = signAccess(user);
    const refreshToken = crypto.randomBytes(40).toString('hex');

    await req.prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      }
    });

    res.status(201).json({ accessToken, refreshToken, user: {
      id: user.id, email: user.email, name: user.name, role: user.role,
      restaurantId: restaurant.id, restaurantName: restaurant.name
    }});
  } catch (e) { next(e); }
});

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Mangler e-post eller passord' });

    const user = await req.prisma.user.findUnique({
      where: { email },
      include: { restaurant: true }
    });
    if (!user || !user.active) return res.status(401).json({ error: 'Ugyldig e-post eller passord' });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Ugyldig e-post eller passord' });

    await req.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    const accessToken = signAccess(user);
    const refreshToken = crypto.randomBytes(40).toString('hex');

    await req.prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      }
    });

    res.json({ accessToken, refreshToken, user: {
      id: user.id, email: user.email, name: user.name, role: user.role,
      restaurantId: user.restaurantId, restaurantName: user.restaurant.name
    }});
  } catch (e) { next(e); }
});

// POST /api/auth/refresh
router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ error: 'Mangler refresh token' });

    const stored = await req.prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: true }
    });
    if (!stored || stored.expiresAt < new Date()) {
      return res.status(401).json({ error: 'Ugyldig eller utløpt refresh token' });
    }

    const accessToken = signAccess(stored.user);
    res.json({ accessToken });
  } catch (e) { next(e); }
});

// POST /api/auth/logout
router.post('/logout', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      await req.prisma.refreshToken.deleteMany({ where: { token: refreshToken } });
    }
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
