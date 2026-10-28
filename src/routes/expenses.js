import { Router } from 'express';
import { db } from '../config/firebase.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

function expensesCol(uid) {
  return db().collection('users').doc(uid).collection('expenses');
}

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const snap = await expensesCol(req.user.uid).get();
    const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const expense = req.body;
    if (!expense?.id || expense.amount == null || !expense.categoryId || !expense.date) {
      return res.status(400).json({ error: 'id, amount, categoryId, date required' });
    }
    await expensesCol(req.user.uid).doc(expense.id).set(expense, { merge: true });
    res.status(201).json({ data: expense });
  } catch (err) {
    next(err);
  }
});

router.post('/bulk', requireAuth, async (req, res, next) => {
  try {
    const expenses = req.body?.expenses;
    if (!Array.isArray(expenses)) {
      return res.status(400).json({ error: 'expenses array required' });
    }
    const batch = db().batch();
    const col = expensesCol(req.user.uid);
    for (const expense of expenses) {
      if (!expense?.id) continue;
      batch.set(col.doc(expense.id), expense, { merge: true });
    }
    await batch.commit();
    res.json({ ok: true, count: expenses.length });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    await expensesCol(req.user.uid).doc(req.params.id).delete();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
