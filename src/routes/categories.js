import { Router } from 'express';
import { db } from '../config/firebase.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

function categoriesCol(uid) {
  return db().collection('users').doc(uid).collection('categories');
}

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const snap = await categoriesCol(req.user.uid).get();
    res.json({ data: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
  } catch (err) {
    next(err);
  }
});

router.post('/bulk', requireAuth, async (req, res, next) => {
  try {
    const categories = req.body?.categories;
    if (!Array.isArray(categories)) {
      return res.status(400).json({ error: 'categories array required' });
    }
    const batch = db().batch();
    const col = categoriesCol(req.user.uid);
    for (const cat of categories) {
      if (!cat?.id) continue;
      batch.set(col.doc(cat.id), cat, { merge: true });
    }
    await batch.commit();
    res.json({ ok: true, count: categories.length });
  } catch (err) {
    next(err);
  }
});

export default router;
