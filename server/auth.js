function requireRelayKey(req, res, next) {
  const required = process.env.RELAY_KEY;
  if (!required) return res.status(500).json({ error: 'RELAY_KEY_NOT_SET' });
  const got = req.header('X-Relay-Key');
  if (!got || got !== required) return res.status(401).json({ error: 'UNAUTHORIZED' });
  next();
}

module.exports = { requireRelayKey };
