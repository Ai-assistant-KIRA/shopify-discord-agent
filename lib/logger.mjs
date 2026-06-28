export function log(level, message, meta = {}) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), level, message, ...meta }));
}