/**
 * Simple in-memory rate limiter middleware factory.
 * No external dependencies — suitable for single-instance deployments.
 */
function createRateLimiter({ windowMs = 15 * 60 * 1000, max = 20, message = 'Too many requests, please try again later.' } = {}) {
  const hits = new Map();

  // Periodically prune expired entries
  setInterval(() => {
    const now = Date.now();
    for (const [key, record] of hits) {
      if (now - record.start > windowMs) hits.delete(key);
    }
  }, windowMs).unref();

  return (req, res, next) => {
    const key = req.ip;
    const now = Date.now();
    const record = hits.get(key);

    if (!record || now - record.start > windowMs) {
      hits.set(key, { start: now, count: 1 });
      return next();
    }

    record.count++;
    if (record.count > max) {
      return res.status(429).send(message);
    }

    next();
  };
}

module.exports = { createRateLimiter };
