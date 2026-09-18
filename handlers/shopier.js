export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method not allowed'
    });
  }

  return res.status(503).json({
    error:
      'Ödeme sistemi henüz aktif değil.'
  });
}
