// GET /api/settings - pengaturan toko yang boleh dilihat publik (nama, WA, alamat, banner).
import { anonClient } from '../config/supabase.js';
import { wrap, allow } from '../lib/http.js';

export default wrap(async (req, res) => {
  allow(req, ['GET']);
  const { data, error } = await anonClient().from('store_settings').select('*').eq('id', 1).maybeSingle();
  if (error) throw error;
  res.status(200).json({
    settings: data || { store_name: 'Warung Umi', whatsapp_number: '6285213205216', address: '', description: '', banner_url: null, banner_title: '', banner_text: '' },
  });
});
