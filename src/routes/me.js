import { Router } from 'express';
import { db } from '../config/firebase.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const ref = db().collection('users').doc(req.user.uid);
    const doc = await ref.get();
    res.json({
      data: {
        uid: req.user.uid,
        email: req.user.email,
        profile: doc.exists ? doc.data() : null,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
