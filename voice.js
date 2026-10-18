const router = require('express').Router();
const { requireAuth } = require('./middleware/auth');
const multer = require('multer');
const Anthropic = require('@anthropic-ai/sdk');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// POST /api/voice/transcribe — Google Speech-to-Text
router.post('/transcribe', requireAuth, upload.single('audio'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Ingen lydfil' });

    const audioBase64 = req.file.buffer.toString('base64');
    const mimeType = req.file.mimetype;

    // Google Speech API
    const encoding = mimeType.includes('webm') ? 'WEBM_OPUS'
                   : mimeType.includes('ogg')  ? 'OGG_OPUS'
                   : mimeType.includes('mp4')  ? 'MP4'
                   : 'LINEAR16';

    const response = await fetch(
      `https://speech.googleapis.com/v1/speech:recognize?key=${process.env.GOOGLE_SPEECH_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: {
            encoding,
            sampleRateHertz: 48000,
            languageCode: 'nb-NO',
            alternativeLanguageCodes: ['en-US']
          },
          audio: { content: audioBase64 }
        })
      }
    );

    const data = await response.json();
    const transcript = data.results?.[0]?.alternatives?.[0]?.transcript || '';

    if (!transcript) return res.json({ transcript: '' });

    // Claude tolker transkripsjon → vare + mengde
    const inventory = await req.prisma.inventoryItem.findMany({
      where: { restaurantId: req.user.restaurantId, active: true },
      select: { id: true, name: true, unit: true }
    });

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const inventoryList = inventory.map(i => `${i.name} (${i.unit})`).join(', ');

    const aiRes = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 200,
      system: 'Du er et varetelling-system. Svar KUN med JSON, ingen annen tekst.',
      messages: [{
        role: 'user',
        content: `Bruker sa: "${transcript}"\n\nTilgjengelige varer: ${inventoryList}\n\nSvar med JSON: {"item":"eksakt varenavn","itemId":"id","qty":12.5,"unit":"kg","confidence":"high/medium/low"}`
      }]
    });

    let parsed = null;
    try {
      const raw = aiRes.content[0]?.text?.trim().replace(/```json|```/g, '') || '{}';
      parsed = JSON.parse(raw);
    } catch (_) {}

    res.json({ transcript, parsed });
  } catch (e) { next(e); }
});

// POST /api/voice/camera — Claude Vision for varetellingsbilde
router.post('/camera', requireAuth, upload.single('image'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Ingen bildefil' });

    const imageBase64 = req.file.buffer.toString('base64');
    const mediaType = req.file.mimetype;

    const inventory = await req.prisma.inventoryItem.findMany({
      where: { restaurantId: req.user.restaurantId, active: true },
      select: { id: true, name: true, unit: true }
    });

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const inventoryList = inventory.map(i => `${i.name} (${i.unit})`).join(', ');

    const response = await anthropic.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 400,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
          {
            type: 'text',
            text: `Se på dette bildet og tell opp de varene du kan identifisere.\n\nVareliste: ${inventoryList}\n\nSvar KUN med JSON: {"items":[{"item":"varenavn","qty":5,"unit":"stk","confidence":"high"}]}`
          }
        ]
      }]
    });

    let parsed = null;
    try {
      const raw = response.content[0]?.text?.trim().replace(/```json|```/g, '') || '{}';
      parsed = JSON.parse(raw);
    } catch (_) {}

    res.json({ parsed });
  } catch (e) { next(e); }
});

module.exports = router;
