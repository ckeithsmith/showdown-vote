function requireRelaySecret(req, res, next) {
  const required = process.env.SF_RELAY_SECRET;
  if (!required) return res.status(500).json({ error: 'SF_RELAY_SECRET_NOT_SET' });
  const got = req.header('X-Relay-Secret');
  if (!got || got !== required) return res.status(401).json({ error: 'UNAUTHORIZED' });
  next();
}

module.exports = { requireRelaySecret };
