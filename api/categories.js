// GET /api/categories - daftar kategori (publik).
import { anonClient } from '../config/supabase.js';
import { wrap, allow } from '../lib/http.js';

export default wrap(async (req, res) => {
  allow(req, ['GET']);
  const { data, error } = await anonClient().from('categories').select('id, name, slug, sort_order').order('sort_order').order('name');
  if (error) throw error;
  res.status(200).json({ categories: data });
});
