export function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim();
  return req.socket?.remoteAddress || '';
}

export function authorized(req) {
  const secret = process.env.TRACKER_SECRET;
  if (!secret) return false;
  const given = req.headers['x-tracker-secret'];
  return typeof given === 'string' && given === secret;
}
