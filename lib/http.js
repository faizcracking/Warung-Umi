// Helper kecil untuk semua endpoint API.
export class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// Membungkus handler agar semua error ditangani seragam.
export const wrap = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (e) {
    if (e instanceof HttpError) return res.status(e.status).json({ error: e.message, code: e.code });
    console.error(e);
    res.status(500).json({ error: 'Terjadi kesalahan pada server. Coba lagi nanti.' });
  }
};

export function allow(req, methods) {
  if (!methods.includes(req.method)) throw new HttpError(405, 'Method tidak diizinkan');
}

export function body(req) {
  const b = req.body;
  if (b && typeof b === 'object') return b;
  try {
    return JSON.parse(b || '{}');
  } catch {
    throw new HttpError(400, 'Format data tidak valid');
  }
}

export const isUuid = (v) =>
  typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

// Membersihkan teks: buang karakter kontrol, trim, batasi panjang.
// (Escape HTML dilakukan saat menampilkan di frontend.)
export function text(v, max, { multiline = false } = {}) {
  let s = String(v ?? '');
  s = multiline
    ? s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    : s.replace(/[\u0000-\u001f\u007f]/g, ' ');
  return s.trim().slice(0, max);
}

export function int(v, min, max, label) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max)
    throw new HttpError(400, `${label} harus berupa angka bulat ${min}-${max}`);
  return n;
}

export function dateOrNull(v, label) {
  if (v === null || v === undefined || v === '') return null;
  const d = new Date(v);
  if (isNaN(d)) throw new HttpError(400, `${label} tidak valid`);
  return d.toISOString();
}

// "0852-1320-5216" / "+62 852..." -> "6285213205216"
export function normalizePhone(raw) {
  let d = String(raw || '').replace(/[^\d+]/g, '').replace(/^\+/, '').replace(/\D/g, '');
  if (d.startsWith('0')) d = '62' + d.slice(1);
  else if (d.startsWith('8')) d = '62' + d;
  return d;
}
