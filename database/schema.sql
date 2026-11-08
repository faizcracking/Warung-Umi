-- =====================================================================
-- WARUNG UMI - Skema Database Supabase (PostgreSQL)
-- Cara pakai: Supabase Dashboard > SQL Editor > New query > tempel > Run
-- Aman dijalankan ulang (idempotent).
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- 1. PROFILES (peran pengguna; admin dibuat manual, bukan registrasi publik) ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username = lower(username) and username ~ '^[a-z0-9_.-]{3,40}$'),
  email text not null,
  role text not null default 'customer' check (role in ('admin', 'customer')),
  must_change_password boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- 2. CATEGORIES ----------
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(name) between 1 and 60),
  slug text not null unique,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- ---------- 3. PRODUCTS (harga normal TIDAK pernah ditimpa harga promo) ----------
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.categories(id) on delete set null,
  name text not null check (char_length(name) between 1 and 120),
  description text not null default '' check (char_length(description) <= 1000),
  price integer not null check (price >= 0),            -- harga normal (Rupiah)
  stock integer not null default 0 check (stock >= 0),
  image_url text,
  is_active boolean not null default true,
  is_featured boolean not null default false,            -- tampil di "Produk Populer"
  -- Promo / diskon
  discount_percentage integer not null default 0 check (discount_percentage between 0 and 90),
  discount_start timestamptz,
  discount_end timestamptz,
  is_discount_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (discount_end is null or discount_start is null or discount_end > discount_start)
);
create index if not exists idx_products_category on public.products(category_id);
create index if not exists idx_products_active on public.products(is_active);
create index if not exists idx_products_created on public.products(created_at desc);

-- ---------- 4. ORDERS (hanya pesanan yang tersimpan di sistem; pesan WA saja tidak tercatat) ----------
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_code text not null unique,
  customer_name text not null,
  customer_phone text not null,
  customer_address text not null default '',
  notes text not null default '',
  delivery_method text not null check (delivery_method in ('diantar', 'ambil_sendiri')),
  status text not null default 'Menunggu konfirmasi'
    check (status in ('Menunggu konfirmasi', 'Diproses', 'Selesai', 'Dibatalkan')),
  is_paid boolean not null default false,                -- dikonfirmasi manual oleh admin
  subtotal_normal integer not null check (subtotal_normal >= 0),
  total integer not null check (total >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_orders_created on public.orders(created_at desc);
create index if not exists idx_orders_status on public.orders(status);

-- ---------- 5. ORDER_ITEMS (snapshot harga saat pesanan dibuat) ----------
create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  unit_price_normal integer not null,
  discount_percentage integer not null default 0,
  unit_price_final integer not null,
  quantity integer not null check (quantity > 0),
  line_total integer not null
);
create index if not exists idx_order_items_order on public.order_items(order_id);

-- ---------- 6. STORE_SETTINGS (satu baris saja, id = 1) ----------
create table if not exists public.store_settings (
  id integer primary key default 1 check (id = 1),
  store_name text not null default 'Warung Umi',
  whatsapp_number text not null default '6285213205216' check (whatsapp_number ~ '^62[0-9]{8,13}$'),
  address text not null default '',
  description text not null default '',
  banner_title text not null default '',
  banner_text text not null default '',
  banner_url text,
  updated_at timestamptz not null default now()
);

-- ---------- Trigger updated_at ----------
create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists trg_products_updated on public.products;
create trigger trg_products_updated before update on public.products for each row execute function public.set_updated_at();
drop trigger if exists trg_orders_updated on public.orders;
create trigger trg_orders_updated before update on public.orders for each row execute function public.set_updated_at();
drop trigger if exists trg_settings_updated on public.store_settings;
create trigger trg_settings_updated before update on public.store_settings for each row execute function public.set_updated_at();

-- ---------- Fungsi cek admin (dipakai kebijakan RLS) ----------
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- =====================================================================
-- ROW LEVEL SECURITY
-- =====================================================================
alter table public.profiles       enable row level security;
alter table public.categories     enable row level security;
alter table public.products       enable row level security;
alter table public.orders         enable row level security;
alter table public.order_items    enable row level security;
alter table public.store_settings enable row level security;

-- profiles: pengguna hanya boleh MEMBACA profilnya sendiri. Tidak ada policy insert/update,
-- jadi role admin tidak bisa ditentukan sendiri oleh pengguna (hanya lewat SQL Editor / service role).
drop policy if exists "profiles read own" on public.profiles;
create policy "profiles read own" on public.profiles for select to authenticated using (id = auth.uid());
drop policy if exists "profiles admin read" on public.profiles;
create policy "profiles admin read" on public.profiles for select to authenticated using (public.is_admin());
revoke insert, update, delete on public.profiles from anon, authenticated;

-- categories: publik boleh baca, admin kelola
drop policy if exists "categories public read" on public.categories;
create policy "categories public read" on public.categories for select to anon, authenticated using (true);
drop policy if exists "categories admin all" on public.categories;
create policy "categories admin all" on public.categories for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- products: publik hanya produk aktif, admin kelola semuanya
drop policy if exists "products public read active" on public.products;
create policy "products public read active" on public.products for select to anon, authenticated using (is_active = true);
drop policy if exists "products admin all" on public.products;
create policy "products admin all" on public.products for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- orders & order_items: HANYA admin (data pelanggan bersifat sensitif).
-- Pesanan baru dibuat lewat API server (service role) setelah harga divalidasi ulang.
drop policy if exists "orders admin all" on public.orders;
create policy "orders admin all" on public.orders for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "order_items admin all" on public.order_items;
create policy "order_items admin all" on public.order_items for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- store_settings: publik boleh baca, hanya admin yang mengubah
drop policy if exists "settings public read" on public.store_settings;
create policy "settings public read" on public.store_settings for select to anon, authenticated using (true);
drop policy if exists "settings admin all" on public.store_settings;
create policy "settings admin all" on public.store_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- =====================================================================
-- STORAGE (foto produk & banner)
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('store-assets', 'store-assets', true, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = 3145728,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists "store-assets admin insert" on storage.objects;
create policy "store-assets admin insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'store-assets' and public.is_admin());
drop policy if exists "store-assets admin update" on storage.objects;
create policy "store-assets admin update" on storage.objects for update to authenticated
  using (bucket_id = 'store-assets' and public.is_admin());
drop policy if exists "store-assets admin delete" on storage.objects;
create policy "store-assets admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'store-assets' and public.is_admin());

-- =====================================================================
-- DATA AWAL
-- =====================================================================
insert into public.store_settings (id, store_name, whatsapp_number, address, description, banner_title, banner_text)
values (1, 'Warung Umi', '6285213205216', 'Jaten, Karanganyar',
        'Toko kelontong keluarga. Belanja kebutuhan sehari-hari, pesan lewat WhatsApp.',
        'Belanja Kebutuhan Harian Jadi Mudah', 'Pilih produk, kirim pesanan lewat WhatsApp, kami antar ke rumah.')
on conflict (id) do nothing;

insert into public.categories (name, slug, sort_order) values
  ('Sembako', 'sembako', 1), ('Minuman', 'minuman', 2), ('Makanan', 'makanan', 3),
  ('Mie Instan', 'mie-instan', 4), ('Perawatan Tubuh', 'perawatan-tubuh', 5),
  ('Kebutuhan Rumah Tangga', 'kebutuhan-rumah-tangga', 6), ('Snack', 'snack', 7), ('Lain-lain', 'lain-lain', 8)
on conflict (slug) do nothing;

-- CONTOH produk agar toko tidak kosong saat pertama dibuka (harga hanya contoh!).
-- Ganti atau hapus lewat dashboard admin. Tidak ada data pesanan/transaksi contoh.
insert into public.products (category_id, name, description, price, stock, is_featured, is_discount_active, discount_percentage)
select c.id, v.name, 'Contoh produk - silakan ubah atau hapus lewat dashboard admin.', v.price, v.stock, v.featured, v.promo, v.pct
from (values
  ('sembako', 'Beras Lahap 5 kg', 75000, 20, true, false, 0),
  ('sembako', 'Gula Pasir GMP 1 kg', 18000, 30, true, true, 10),
  ('minuman', 'Teh Celup 25 pcs', 6500, 40, false, false, 0),
  ('mie-instan', 'Mie Instan Goreng', 3500, 100, true, true, 20),
  ('perawatan-tubuh', 'Sabun Mandi Batang', 4500, 0, false, false, 0),
  ('snack', 'Keripik Singkong 150 g', 12000, 25, false, false, 0)
) as v(cat, name, price, stock, featured, promo, pct)
join public.categories c on c.slug = v.cat
where not exists (select 1 from public.products);
