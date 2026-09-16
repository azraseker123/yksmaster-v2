import crypto from 'crypto';
import { db } from '../lib/db.js';
import { LICENSE_PACKAGES } from '../lib/plans.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  return res.status(200).json({
    ok: true,
    message: 'Shopier webhook hazır.'
  });
}
