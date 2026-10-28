import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import morgan from 'morgan';

import { initFirebase } from './config/firebase.js';
import aiRouter from './routes/ai.js';
import budgetsRouter from './routes/budgets.js';
import categoriesRouter from './routes/categories.js';
import expensesRouter from './routes/expenses.js';
import meRouter from './routes/me.js';
import recurringRouter from './routes/recurring.js';

const app = express();
const port = Number(process.env.PORT || 3000);
const origins = process.env.ALLOWED_ORIGINS || '*';

try {
  initFirebase();
  console.log('Firebase Admin initialized');
} catch (err) {
  console.error(err.message);
  console.error('Server will start but authenticated routes will fail until credentials are set.');
}

app.use(
  cors({
    origin: origins === '*' ? true : origins.split(',').map((s) => s.trim()),
  }),
);
app.use(express.json({ limit: '2mb' }));
app.use(morgan('dev'));

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'spendwise-backend',
    time: new Date().toISOString(),
  });
});

app.use('/api/me', meRouter);
app.use('/api/expenses', expensesRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/budgets', budgetsRouter);
app.use('/api/recurring', recurringRouter);
app.use('/ai', aiRouter);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error', details: err.message });
});

app.listen(port, () => {
  console.log(`SpendWise backend listening on http://localhost:${port}`);
});
