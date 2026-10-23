// Drevn — seed for arbeidstid/lønn
// Kjør: node prisma/seed-workforce.js            (systemmaler + helligdager)
//       node prisma/seed-workforce.js <restaurantId>  (+ standard lønnsarter for én restaurant)
//
// Idempotent: kan kjøres flere ganger.

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const D = (s) => new Date(s + 'T00:00:00Z');

// ─── 1. Regelsett: AML-minimum (lovens grenser, uten tariff) ───────────────
const AML_MIN = {
  code: 'AML_MIN', name: 'Arbeidsmiljøloven – minimum (uten tariff)',
  kind: 'STATUTORY', version: 1, validFrom: D('2026-01-01'),
  sourceUrl: 'https://lovdata.no/lov/2005-06-17-62/kap10',
  normalHoursPerDay: 9, normalHoursPerWeek: 40,          // § 10-4 (1)
  overtimePercent: 40,                                   // § 10-6 (11)
  maxOvertimePer7Days: 10, maxOvertimePer4Weeks: 25, maxOvertimePer52Weeks: 200, // § 10-6 (4)
  maxTotalHoursPerDay: 13, maxTotalHoursPer7Days: 48,    // § 10-6 (8)
  minDailyRestHours: 11, minWeeklyRestHours: 35,         // § 10-8
  breakRequiredAfterHours: 5.5, minBreakMinutesOver8h: 30, // § 10-9
  breakIsPaidDefault: false,
};

const AML_PAY_RULES = [
  { code: 'OT40', name: 'Overtid 40 %', trigger: 'OVERTIME', amountType: 'PERCENT', amount: 40, payItemCode: 'OT40', stackable: true },
];

// ─── 2. Regelsett: Riksavtalen hotell og restaurant (MAL) ──────────────────
// Struktur er klar; satser MÅ fylles inn fra gjeldende tariff før bruk.
// extra.needsRates = true gjør at UI/regelmotor nekter å bruke den før satser er satt.
const RIKSAVTALEN = {
  code: 'RIKSAVTALEN_HR', name: 'Riksavtalen hotell og restaurant (mal – satser må fylles inn)',
  kind: 'TARIFF', version: 1, validFrom: D('2026-01-01'),
  sourceUrl: 'https://www.nho.no/tariffavtaler/',
  normalHoursPerDay: 9, normalHoursPerWeek: 37.5,
  overtimePercent: 50,
  maxOvertimePer7Days: 10, maxOvertimePer4Weeks: 25, maxOvertimePer52Weeks: 200,
  maxTotalHoursPerDay: 13, maxTotalHoursPer7Days: 48,
  minDailyRestHours: 11, minWeeklyRestHours: 35,
  breakRequiredAfterHours: 5.5, minBreakMinutesOver8h: 30,
  breakIsPaidDefault: false,
  extra: { needsRates: true, note: 'Verifiser normalarbeidstid, overtidssats, tillegg og lønnstrinn mot gjeldende Riksavtale.' },
};

const RIKSAVTALEN_PAY_RULES = [
  { code: 'KVELD',     name: 'Kveldstillegg',      trigger: 'TIME_WINDOW', daysOfWeek: [], startTime: '21:00', endTime: '06:00', amountType: 'PER_HOUR', amount: 0, payItemCode: 'KVELD' },
  { code: 'LORDAG',    name: 'Lørdagstillegg',     trigger: 'TIME_WINDOW', daysOfWeek: [6], startTime: '13:00', endTime: '24:00', amountType: 'PER_HOUR', amount: 0, payItemCode: 'LORDAG' },
  { code: 'SONDAG',    name: 'Søndagstillegg',     trigger: 'TIME_WINDOW', daysOfWeek: [7], amountType: 'PER_HOUR', amount: 0, payItemCode: 'SONDAG' },
  { code: 'HELLIGDAG', name: 'Helligdagstillegg',  trigger: 'HOLIDAY', holidayTypes: ['PUBLIC_HOLIDAY'], amountType: 'PERCENT', amount: 0, payItemCode: 'HELLIGDAG', stackable: false, priority: 10 },
  { code: 'OT50',      name: 'Overtid 50 %',       trigger: 'OVERTIME', amountType: 'PERCENT', amount: 50, payItemCode: 'OT50' },
  { code: 'OT100',     name: 'Overtid 100 %',      trigger: 'OVERTIME_HIGH', amountType: 'PERCENT', amount: 100, payItemCode: 'OT100', stackable: false, priority: 20 },
];

const RIKSAVTALEN_STEPS = [
  { category: 'Ufaglært', minYears: 0 },
  { category: 'Ufaglært', minYears: 2 },
  { category: 'Faglært',  minYears: 0 },
  { category: 'Faglært',  minYears: 4 },
  { category: 'Lærling',  minYears: 0 },
];

// ─── 3. Standard lønnsarter (mappes mot PowerOffice i onboarding) ──────────
const DEFAULT_PAY_ITEMS = [
  ['ORD', 'Ordinær timelønn', 'HOURS'],
  ['FAST', 'Fastlønn', 'AMOUNT'],
  ['OT40', 'Overtid 40 %', 'HOURS'],
  ['OT50', 'Overtid 50 %', 'HOURS'],
  ['OT100', 'Overtid 100 %', 'HOURS'],
  ['KVELD', 'Kveldstillegg', 'HOURS'],
  ['NATT', 'Nattillegg', 'HOURS'],
  ['LORDAG', 'Lørdagstillegg', 'HOURS'],
  ['SONDAG', 'Søndagstillegg', 'HOURS'],
  ['HELLIGDAG', 'Helligdagstillegg', 'HOURS'],
  ['BETPAUSE', 'Betalt pause', 'HOURS'],
];

// ─── Helligdager (Norge) ───────────────────────────────────────────────────
function easter(y) { // Meeus/Jones/Butcher
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(y, month - 1, day));
}
const addDays = (dt, n) => new Date(dt.getTime() + n * 864e5);

function norwegianHolidays(y) {
  const e = easter(y);
  return [
    [D(`${y}-01-01`), '1. nyttårsdag', 'PUBLIC_HOLIDAY'],
    [addDays(e, -3), 'Skjærtorsdag', 'PUBLIC_HOLIDAY'],
    [addDays(e, -2), 'Langfredag', 'PUBLIC_HOLIDAY'],
    [addDays(e, -1), 'Påskeaften', 'HIGH_HOLIDAY'],
    [e, '1. påskedag', 'PUBLIC_HOLIDAY'],
    [addDays(e, 1), '2. påskedag', 'PUBLIC_HOLIDAY'],
    [D(`${y}-05-01`), 'Arbeidernes dag', 'PUBLIC_HOLIDAY'],
    [D(`${y}-05-17`), 'Grunnlovsdag', 'PUBLIC_HOLIDAY'],
    [addDays(e, 39), 'Kristi himmelfartsdag', 'PUBLIC_HOLIDAY'],
    [addDays(e, 48), 'Pinseaften', 'HIGH_HOLIDAY'],
    [addDays(e, 49), '1. pinsedag', 'PUBLIC_HOLIDAY'],
    [addDays(e, 50), '2. pinsedag', 'PUBLIC_HOLIDAY'],
    [D(`${y}-12-24`), 'Julaften', 'HIGH_HOLIDAY', '15:00'],
    [D(`${y}-12-25`), '1. juledag', 'PUBLIC_HOLIDAY'],
    [D(`${y}-12-26`), '2. juledag', 'PUBLIC_HOLIDAY'],
    [D(`${y}-12-31`), 'Nyttårsaften', 'HIGH_HOLIDAY', '15:00'],
  ];
}

// ─── Kjøring ───────────────────────────────────────────────────────────────
async function upsertSystemRuleSet(def, payRules, steps = []) {
  let rs = await prisma.ruleSet.findFirst({ where: { restaurantId: null, code: def.code, version: def.version } });
  if (!rs) rs = await prisma.ruleSet.create({ data: def });
  for (const pr of payRules) {
    const exists = await prisma.payRule.findFirst({ where: { ruleSetId: rs.id, code: pr.code } });
    if (!exists) await prisma.payRule.create({ data: { daysOfWeek: [], holidayTypes: [], ...pr, ruleSetId: rs.id, validFrom: def.validFrom } });
  }
  for (const st of steps) {
    const exists = await prisma.wageStep.findFirst({ where: { ruleSetId: rs.id, category: st.category, minYears: st.minYears } });
    if (!exists) await prisma.wageStep.create({ data: { ...st, ruleSetId: rs.id, validFrom: def.validFrom } });
  }
  return rs;
}

async function seedPayItems(restaurantId) {
  for (const [code, name, unit] of DEFAULT_PAY_ITEMS) {
    await prisma.payItem.upsert({
      where: { restaurantId_code: { restaurantId, code } },
      update: {},
      create: { restaurantId, code, name, unit },
    });
  }
}

async function main() {
  const aml = await upsertSystemRuleSet(AML_MIN, AML_PAY_RULES);
  const rik = await upsertSystemRuleSet(RIKSAVTALEN, RIKSAVTALEN_PAY_RULES, RIKSAVTALEN_STEPS);
  console.log('Regelsett:', aml.code, rik.code);

  const year = new Date().getUTCFullYear();
  let n = 0;
  for (const y of [year, year + 1]) {
    for (const [date, name, type, startTime] of norwegianHolidays(y)) {
      await prisma.holiday.upsert({
        where: { country_date_type: { country: 'NO', date, type } },
        update: { name, startTime: startTime || null },
        create: { country: 'NO', date, name, type, startTime: startTime || null },
      });
      n++;
    }
  }
  console.log('Helligdager:', n);

  const restaurantId = process.argv[2];
  if (restaurantId) { await seedPayItems(restaurantId); console.log('Lønnsarter for', restaurantId); }
}

if (require.main === module) {
  main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
}

module.exports = { seedPayItems, norwegianHolidays, DEFAULT_PAY_ITEMS };
