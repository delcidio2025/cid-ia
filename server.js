require('dotenv').config();
const express = require('express');
const axios = require('axios');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ──────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Upload config
const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

// Ensure uploads folder exists
if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');

// ── Groq AI Chat ────────────────────────────────────────────────────────────
app.post('/api/chat', async (req, res) => {
  try {
    const { messages, mode } = req.body;

    const systemPrompts = {
      geral: 'Você é o CID, um assistente de IA avançado. Responda sempre no idioma que o usuário escrever.',
      dev: 'Você é o CID no modo Desenvolvedor. Especialista em programação, código, arquitetura de software. Responda no idioma do usuário.',
      dados: 'Você é o CID no modo Analista de Dados. Especialista em SQL, Python, estatística, visualização. Responda no idioma do usuário.',
      juridico: 'Você é o CID no modo Jurídico. Especialista em direito brasileiro, contratos, legislação. Responda no idioma do usuário.',
      financeiro: 'Você é o CID no modo Financeiro. Especialista em finanças, investimentos, economia. Responda no idioma do usuário.',
      professor: 'Você é o CID no modo Professor. Explique conceitos de forma clara e didática. Responda no idioma do usuário.',
      tradutor: 'Você é o CID no modo Tradutor. Traduza e localize textos com precisão cultural. Detecte o idioma automaticamente.',
      copywriter: 'Você é o CID no modo Copywriter. Especialista em textos persuasivos, marketing, vendas. Responda no idioma do usuário.',
      design: 'Você é o CID no modo Design. Especialista em UI/UX, identidade visual, tipografia. Responda no idioma do usuário.',
      saude: 'Você é o CID no modo Saúde. Fornece informações educacionais sobre saúde. Sempre recomende consultar profissional. Responda no idioma do usuário.'
    };

    const systemContent = systemPrompts[mode] || systemPrompts.geral;

    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'llama3-70b-8192',
        messages: [
          { role: 'system', content: systemContent },
          ...messages
        ],
        max_tokens: 4096,
        temperature: 0.7,
        stream: false
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    const reply = response.data.choices[0].message.content;
    res.json({ reply, model: 'llama3-70b-8192' });
  } catch (err) {
    console.error('Chat error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Erro ao conectar com a IA. Verifique sua GROQ_API_KEY.' });
  }
});

// ── Chat com Imagem (Vision) ────────────────────────────────────────────────
app.post('/api/chat-image', upload.single('image'), async (req, res) => {
  try {
    const { message } = req.body;
    const imageFile = req.file;

    if (!imageFile) return res.status(400).json({ error: 'Imagem não enviada' });

    const imageData = fs.readFileSync(imageFile.path);
    const base64Image = imageData.toString('base64');
    const mimeType = imageFile.mimetype;

    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'llava-v1.5-7b-4096-preview',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Image}` } },
              { type: 'text', text: message || 'Analise esta imagem detalhadamente.' }
            ]
          }
        ],
        max_tokens: 1024
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    fs.unlinkSync(imageFile.path);
    res.json({ reply: response.data.choices[0].message.content });
  } catch (err) {
    console.error('Vision error:', err.response?.data || err.message);
    if (req.file) fs.unlinkSync(req.file.path).catch(() => {});
    res.status(500).json({ error: 'Erro na análise de imagem.' });
  }
});

// ── Gerador de Imagem (Pollinations) ───────────────────────────────────────
app.get('/api/generate-image', async (req, res) => {
  try {
    const { prompt, width = 1024, height = 1024 } = req.query;
    if (!prompt) return res.status(400).json({ error: 'Prompt obrigatório' });

    const encodedPrompt = encodeURIComponent(prompt);
    const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&nologo=true`;

    res.json({ url: imageUrl });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao gerar imagem.' });
  }
});

// ── QR Code ────────────────────────────────────────────────────────────────
app.post('/api/qrcode', async (req, res) => {
  try {
    const QRCode = require('qrcode');
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'Texto obrigatório' });

    const qrDataUrl = await QRCode.toDataURL(text, { width: 400, margin: 2 });
    res.json({ qr: qrDataUrl });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao gerar QR Code.' });
  }
});

// ── Resumir texto com IA ───────────────────────────────────────────────────
app.post('/api/summarize', async (req, res) => {
  try {
    const { text, language = 'auto' } = req.body;
    if (!text) return res.status(400).json({ error: 'Texto obrigatório' });

    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'llama3-70b-8192',
        messages: [
          {
            role: 'system',
            content: 'Você é um resumidor especialista. Responda no mesmo idioma do texto enviado.'
          },
          {
            role: 'user',
            content: `Resuma o seguinte texto de forma clara e concisa, destacando os pontos principais:\n\n${text}`
          }
        ],
        max_tokens: 1024
      },
      {
        headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' }
      }
    );

    res.json({ summary: response.data.choices[0].message.content });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao resumir.' });
  }
});

// ── Status ─────────────────────────────────────────────────────────────────
app.get('/api/status', (req, res) => {
  res.json({
    status: 'online',
    version: '2.0.0',
    model: 'llama3-70b-8192',
    tools: 50,
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// ── Serve index.html ───────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Error Handler ──────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Erro interno do servidor.' });
});

// ── Start ──────────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔════════════════════════════════════════╗
║   🤖 CID — Central Intelligence Digital ║
║   Versão 2.0 | Porta ${PORT}              ║
║   Status: ONLINE ✅                     ║
╚════════════════════════════════════════╝
  `);
});
