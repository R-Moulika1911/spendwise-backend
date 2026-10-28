import { Router } from 'express';
import { db } from '../config/firebase.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const doc = await db().collection('users').doc(req.user.uid).get();
    const settings = doc.data()?.settings || {};
    res.json({
      data: {
        monthlyBudget: settings.monthlyBudget ?? null,
        currency: settings.currency ?? '₹',
      },
    });
  } catch (err) {
    next(err);
  }
});

router.put('/', requireAuth, async (req, res, next) => {
  try {
    const monthlyBudget = req.body?.monthlyBudget;
    await db()
      .collection('users')
      .doc(req.user.uid)
      .set(
        {
          settings: {
            monthlyBudget: monthlyBudget ?? null,
            updatedAt: new Date().toISOString(),
          },
        },
        { merge: true },
      );
    res.json({ ok: true, monthlyBudget: monthlyBudget ?? null });
  } catch (err) {
    next(err);
  }
});

export default router;
