import { Router } from 'express';
import { db } from '../config/firebase.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

function recurringCol(uid) {
  return db().collection('users').doc(uid).collection('recurring');
}

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const snap = await recurringCol(req.user.uid).get();
    res.json({ data: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
  } catch (err) {
    next(err);
  }
});

router.post('/bulk', requireAuth, async (req, res, next) => {
  try {
    const items = req.body?.items;
    if (!Array.isArray(items)) {
      return res.status(400).json({ error: 'items array required' });
    }
    const batch = db().batch();
    const col = recurringCol(req.user.uid);
    for (const item of items) {
      if (!item?.id) continue;
      batch.set(col.doc(item.id), item, { merge: true });
    }
    await batch.commit();
    res.json({ ok: true, count: items.length });
  } catch (err) {
    next(err);
  }
});

export default router;
