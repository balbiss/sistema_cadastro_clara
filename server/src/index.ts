import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { initDb } from './db/client.js';
import { publicoRouter } from './routes/publico.js';
import { cadastrosRouter } from './routes/cadastros.js';
import { configRouter } from './routes/config.js';
import { quizRouter } from './routes/quiz.js';
import { iniciarFilaCrm } from './lib/eventos.js';
import { iniciarStorage } from './lib/storage.js';

process.on('unhandledRejection', err => console.error('Erro não tratado (servidor segue no ar):', err));

const app = express();
app.set('trust proxy', true);
app.use(cors({ origin: (process.env.CORS_ORIGIN || 'http://localhost:5185').split(',') }));
app.use(express.json({ limit: '2mb' }));

app.get('/up', (_req, res) => res.json({ ok: true }));
app.use(quizRouter);
app.use(publicoRouter);
app.use(configRouter);
app.use(cadastrosRouter);
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: err.message.includes('File too large') ? 'Arquivo maior que 10 MB' : 'Erro no servidor' });
});

const port = Number(process.env.PORT) || 3013;
await initDb();
await iniciarStorage();
app.listen(port, () => {
  console.log('Clara Cadastros (API) em http://localhost:' + port);
  iniciarFilaCrm();
});
