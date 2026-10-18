const router = require('express').Router();
const { requireAuth, requireRole } = require('./middleware/auth');

router.use(requireAuth);

// GET /api/chat/sessions
router.get('/sessions', async (req, res, next) => {
  try {
    const { status } = req.query;
    const where = { restaurantId: req.user.restaurantId };
    if (status) where.status = status;

    const sessions = await req.prisma.chatSession.findMany({
      where,
      include: {
        messages: { orderBy: { createdAt: 'desc' }, take: 1 }
      },
      orderBy: { updatedAt: 'desc' }
    });
    res.json(sessions);
  } catch (e) { next(e); }
});

// GET /api/chat/sessions/:id
router.get('/sessions/:id', async (req, res, next) => {
  try {
    const session = await req.prisma.chatSession.findFirst({
      where: { id: req.params.id, restaurantId: req.user.restaurantId },
      include: { messages: { orderBy: { createdAt: 'asc' } } }
    });
    if (!session) return res.status(404).json({ error: 'Ikke funnet' });
    res.json(session);
  } catch (e) { next(e); }
});

// POST /api/chat/send — fra widget (gjest)
// Ikke auth-beskyttet — brukes av chat.js widgeten
router.post('/send', async (req, res, next) => {
  try {
    const { restaurantId, sessionId, guestName, guestPhone, message } = req.body;
    if (!restaurantId || !message) {
      return res.status(400).json({ error: 'Mangler restaurantId eller melding' });
    }

    let session;
    if (sessionId) {
      session = await req.prisma.chatSession.findUnique({ where: { id: sessionId } });
    }
    if (!session) {
      session = await req.prisma.chatSession.create({
        data: {
          restaurantId,
          guestName: guestName || null,
          guestPhone: guestPhone || null
        }
      });
    }

    const msg = await req.prisma.chatMessage.create({
      data: {
        sessionId: session.id,
        role: 'GUEST',
        content: message
      }
    });

    // Oppdater session timestamp
    await req.prisma.chatSession.update({
      where: { id: session.id },
      data: { updatedAt: new Date() }
    });

    res.json({ sessionId: session.id, messageId: msg.id });
  } catch (e) { next(e); }
});

// POST /api/chat/reply — fra CRM (ansatt)
router.post('/reply', requireAuth, async (req, res, next) => {
  try {
    const { sessionId, message } = req.body;
    const session = await req.prisma.chatSession.findFirst({
      where: { id: sessionId, restaurantId: req.user.restaurantId }
    });
    if (!session) return res.status(404).json({ error: 'Ikke funnet' });

    const msg = await req.prisma.chatMessage.create({
      data: { sessionId, role: 'STAFF', content: message }
    });

    await req.prisma.chatSession.update({
      where: { id: sessionId },
      data: { updatedAt: new Date() }
    });

    res.json(msg);
  } catch (e) { next(e); }
});

// GET /api/chat/poll/:sessionId — polling fra widget
router.get('/poll/:sessionId', async (req, res, next) => {
  try {
    const { since } = req.query;
    const where = { sessionId: req.params.sessionId };
    if (since) where.createdAt = { gt: new Date(since) };

    const messages = await req.prisma.chatMessage.findMany({
      where,
      orderBy: { createdAt: 'asc' }
    });
    res.json(messages);
  } catch (e) { next(e); }
});

// POST /api/chat/suggest — AI-svarforslag via Claude
router.post('/suggest', requireAuth, async (req, res, next) => {
  try {
    const { sessionId } = req.body;
    const session = await req.prisma.chatSession.findFirst({
      where: { id: sessionId, restaurantId: req.user.restaurantId },
      include: { messages: { orderBy: { createdAt: 'asc' }, take: 20 } }
    });
    if (!session) return res.status(404).json({ error: 'Ikke funnet' });

    const restaurant = await req.prisma.restaurant.findUnique({
      where: { id: req.user.restaurantId }
    });

    const Anthropic = require('@anthropic-ai/sdk');
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const history = session.messages.map(m => ({
      role: m.role === 'GUEST' ? 'user' : 'assistant',
      content: m.content
    }));

    const response = await anthropic.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 300,
      system: `Du er kundeservice-assistent for ${restaurant.name}. Svar kort og vennlig på norsk. Hjelp gjester med spørsmål om åpningstider, booking, meny og generell info.`,
      messages: history.length ? history : [{ role: 'user', content: 'Hei' }]
    });

    const suggestion = response.content[0]?.text || '';

    // Lagre som AI-forslag
    await req.prisma.chatMessage.create({
      data: { sessionId, role: 'AI', content: suggestion, aiSuggested: true }
    });

    res.json({ suggestion });
  } catch (e) { next(e); }
});

// PATCH /api/chat/sessions/:id — oppdater status, assignedTo
router.patch('/sessions/:id', requireAuth, async (req, res, next) => {
  try {
    const session = await req.prisma.chatSession.findFirst({
      where: { id: req.params.id, restaurantId: req.user.restaurantId }
    });
    if (!session) return res.status(404).json({ error: 'Ikke funnet' });

    const updated = await req.prisma.chatSession.update({
      where: { id: req.params.id },
      data: req.body
    });
    res.json(updated);
  } catch (e) { next(e); }
});

module.exports = router;
