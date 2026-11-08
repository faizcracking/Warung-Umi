// /api/admin/categories  GET | POST | PUT ?id= | DELETE ?id=
import { requireAdmin } from '../../lib/auth.js';
import { wrap, allow, body, HttpError, isUuid, text } from '../../lib/http.js';

const slugify = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'kategori';

function validate(b) {
  const name = text(b.name, 60);
  if (!name) throw new HttpError(400, 'Nama kategori wajib diisi');
  return { name, slug: slugify(name) };
}
const dupMsg = (e) => (e?.code === '23505' ? new HttpError(409, 'Nama kategori sudah dipakai') : e);

export default wrap(async (req, res) => {
  allow(req, ['GET', 'POST', 'PUT', 'DELETE']);
  const { db } = await requireAdmin(req);

  if (req.method === 'GET') {
    const { data, error } = await db.from('categories').select('*').order('sort_order').order('name');
    if (error) throw error;
    return res.status(200).json({ categories: data });
  }
  if (req.method === 'POST') {
    const { data, error } = await db.from('categories').insert({ ...validate(body(req)), sort_order: 100 }).select().single();
    if (error) throw dupMsg(error);
    return res.status(201).json({ category: data });
  }

  const id = String(req.query.id || '');
  if (!isUuid(id)) throw new HttpError(400, 'ID kategori tidak valid');

  if (req.method === 'PUT') {
    const { data, error } = await db.from('categories').update(validate(body(req))).eq('id', id).select().single();
    if (error) throw dupMsg(error);
    return res.status(200).json({ category: data });
  }
  const { error } = await db.from('categories').delete().eq('id', id); // produk jadi "tanpa kategori"
  if (error) throw error;
  res.status(200).json({ ok: true });
});
