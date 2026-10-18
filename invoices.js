const router = require('express').Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const xml2js = require('xml2js');

router.use(requireAuth);

// GET /api/invoices
router.get('/', async (req, res, next) => {
  try {
    const invoices = await req.prisma.invoice.findMany({
      where: { restaurantId: req.user.restaurantId },
      include: { supplier: { select: { name: true } } },
      orderBy: { createdAt: 'desc' }
    });
    res.json(invoices);
  } catch (e) { next(e); }
});

// POST /api/invoices/ehf — importer EHF XML
router.post('/ehf', requireRole('OWNER', 'MANAGER'), async (req, res, next) => {
  try {
    const { xml } = req.body;
    if (!xml) return res.status(400).json({ error: 'Mangler XML' });

    const parsed = await xml2js.parseStringPromise(xml, { explicitArray: false });

    // EHF/UBL parsing (forenklet)
    const inv = parsed['Invoice'] || parsed['ubl:Invoice'] || {};
    const invoiceNr = inv['cbc:ID'] || null;
    const totalStr = inv['cac:LegalMonetaryTotal']?.['cbc:PayableAmount']?.['_'] ||
                     inv['cac:LegalMonetaryTotal']?.['cbc:PayableAmount'] || '0';
    const total = parseFloat(totalStr);

    const supplierName = inv['cac:AccountingSupplierParty']?.['cac:Party']
      ?.['cac:PartyName']?.['cbc:Name'] || 'Ukjent leverandør';

    // Finn eller opprett leverandør
    let supplier = await req.prisma.supplier.findFirst({
      where: { restaurantId: req.user.restaurantId, name: supplierName }
    });
    if (!supplier) {
      supplier = await req.prisma.supplier.create({
        data: { restaurantId: req.user.restaurantId, name: supplierName }
      });
    }

    const invoice = await req.prisma.invoice.create({
      data: {
        restaurantId: req.user.restaurantId,
        supplierId: supplier.id,
        invoiceNr,
        total,
        rawEhf: xml,
        status: 'PENDING'
      }
    });

    res.status(201).json(invoice);
  } catch (e) { next(e); }
});

// PATCH /api/invoices/:id
router.patch('/:id', requireRole('OWNER', 'MANAGER'), async (req, res, next) => {
  try {
    const invoice = await req.prisma.invoice.findFirst({
      where: { id: req.params.id, restaurantId: req.user.restaurantId }
    });
    if (!invoice) return res.status(404).json({ error: 'Ikke funnet' });
    const updated = await req.prisma.invoice.update({
      where: { id: req.params.id },
      data: req.body
    });
    res.json(updated);
  } catch (e) { next(e); }
});

module.exports = router;
