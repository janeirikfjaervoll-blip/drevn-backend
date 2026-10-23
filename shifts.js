const router = require('express').Router();
const { requireAuth, requireRole } = require('./middleware/auth');

router.use(requireAuth);

const TZ = 'Europe/Oslo';

// "2026-10-23" + "17:00" (lokal Oslo-tid) → Date (UTC)
function localToUtc(dateStr, timeStr) {
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d, hh, mm));
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
  }).formatToParts(guess).reduce((a, p) => (a[p.type] = p.value, a), {});
  const asLocal = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
  return new Date(guess.getTime() - (asLocal - guess.getTime()));
}

// Godtar både nytt format (startAt/endAt ISO) og gammelt (date + startTime/endTime "HH:MM")
function normalize(body) {
  const data = { ...body };
  if (data.date && data.startTime && !data.startAt) data.startAt = localToUtc(data.date, data.startTime);
  if (data.date && data.endTime && !data.endAt) {
    let end = localToUtc(data.date, data.endTime);
    if (end <= new Date(data.startAt)) end = new Date(end.getTime() + 24 * 3600 * 1000); // over midnatt
    data.endAt = end;
  }
  if (data.date) data.date = new Date(data.date.slice(0, 10));
  if (data.startAt) data.startAt = new Date(data.startAt);
  if (data.endAt) data.endAt = new Date(data.endAt);
  if (data.published === true) { data.status = 'PUBLISHED'; data.publishedAt = new Date(); }
  delete data.startTime; delete data.endTime; delete data.published;
  delete data.restaurantId; delete data.id;
  return data;
}

// GET /api/shifts?week=2026-10-19&employeeId=...
router.get('/', async (req, res, next) => {
  try {
    const { week, employeeId, from, to } = req.query;
    const where = { restaurantId: req.user.restaurantId, status: { not: 'CANCELLED' } };
    if (employeeId) where.employeeId = employeeId;
    if (week) {
      const start = new Date(week);
      const end = new Date(start); end.setDate(end.getDate() + 7);
      where.date = { gte: start, lt: end };
    } else if (from && to) {
      where.date = { gte: new Date(from), lte: new Date(to) };
    }
    // Ansatte (STAFF) ser kun publiserte vakter
    if (req.user.role === 'STAFF') where.status = 'PUBLISHED';

    const shifts = await req.prisma.shift.findMany({
      where,
      include: { employee: true, warnings: { where: { acknowledgedAt: null } } },
      orderBy: [{ date: 'asc' }, { startAt: 'asc' }]
    });
    res.json(shifts);
  } catch (e) { next(e); }
});

// POST /api/shifts
router.post('/', requireRole('OWNER', 'MANAGER'), async (req, res, next) => {
  try {
    const data = normalize(req.body);
    if (!data.startAt || !data.endAt || !data.date) {
      return res.status(400).json({ error: 'date, startAt og endAt (eller startTime/endTime) er påkrevd' });
    }
    const shift = await req.prisma.shift.create({
      data: { ...data, restaurantId: req.user.restaurantId, createdById: req.user.userId },
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
    const body = { ...req.body };
    if (body.startTime && !body.date) body.date = shift.date.toISOString();
    const updated = await req.prisma.shift.update({
      where: { id: req.params.id },
      data: normalize(body),
      include: { employee: true }
    });
    res.json(updated);
  } catch (e) { next(e); }
});

// DELETE /api/shifts/:id — publiserte vakter kanselleres (sporbarhet), utkast slettes
router.delete('/:id', requireRole('OWNER', 'MANAGER'), async (req, res, next) => {
  try {
    const shift = await req.prisma.shift.findFirst({
      where: { id: req.params.id, restaurantId: req.user.restaurantId }
    });
    if (!shift) return res.status(404).json({ error: 'Ikke funnet' });
    if (shift.status === 'DRAFT') {
      await req.prisma.shift.delete({ where: { id: shift.id } });
    } else {
      await req.prisma.shift.update({ where: { id: shift.id }, data: { status: 'CANCELLED' } });
    }
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// POST /api/shifts/publish — publiser utkast for en uke
router.post('/publish', requireRole('OWNER', 'MANAGER'), async (req, res, next) => {
  try {
    const start = new Date(req.body.week);
    const end = new Date(start); end.setDate(end.getDate() + 7);
    const r = await req.prisma.shift.updateMany({
      where: { restaurantId: req.user.restaurantId, date: { gte: start, lt: end }, status: 'DRAFT' },
      data: { status: 'PUBLISHED', publishedAt: new Date() }
    });
    res.json({ ok: true, published: r.count });
  } catch (e) { next(e); }
});

module.exports = router;
module.exports.localToUtc = localToUtc;
