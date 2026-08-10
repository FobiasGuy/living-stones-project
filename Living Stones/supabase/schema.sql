-- Living Stones Project — database schema
-- Run this whole file once in Supabase: Dashboard → SQL Editor → New query → paste → Run

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  role text not null default 'customer' check (role in ('customer','admin','owner')),
  created_at timestamptz not null default now()
);

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  image text,
  description text,
  price numeric not null default 0,
  category text,
  stock int not null default 0,
  available boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists orders (
  id text primary key,
  user_id uuid not null references auth.users(id),
  username text not null,
  total numeric not null default 0,
  payment_status text not null default 'Payment Pending'
    check (payment_status in ('Payment Pending','Payment Received','Payment Cancelled')),
  stage text not null default 'Order Placed'
    check (stage in ('Order Placed','Payment Confirmed','Preparing','In Production','Ready','Completed')),
  admin_notes text,
  estimated_completion date,
  created_at timestamptz not null default now()
);
create index if not exists orders_user_id_idx on orders(user_id);

create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  order_id text not null references orders(id) on delete cascade,
  product_id uuid references products(id),
  name text not null,
  price numeric not null,
  qty int not null
);

create table if not exists order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id text not null references orders(id) on delete cascade,
  stage text not null,
  timestamp timestamptz not null default now()
);

create table if not exists custom_requests (
  id text primary key,
  user_id uuid not null references auth.users(id),
  username text not null,
  item_wanted text not null,
  description text,
  category text,
  style text,
  quantity int default 1,
  budget text,
  reference_image text,
  notes text,
  status text not null default 'Submitted'
    check (status in ('Submitted','Reviewing','Discussing','Approved','In Production','Ready','Completed','Rejected')),
  admin_response text,
  estimated_price numeric,
  created_at timestamptz not null default now()
);
create index if not exists custom_requests_user_id_idx on custom_requests(user_id);

create table if not exists request_status_history (
  id uuid primary key default gen_random_uuid(),
  request_id text not null references custom_requests(id) on delete cascade,
  status text not null,
  timestamp timestamptz not null default now()
);

create table if not exists things (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  cover_image text,
  content text,
  photos text[] default '{}',
  videos text[] default '{}',
  date date default current_date,
  author text,
  published boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists settings (
  id int primary key default 1,
  site_name text not null default 'Living Stones Project',
  constraint settings_singleton check (id = 1)
);
insert into settings (id, site_name) values (1, 'Living Stones Project')
  on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- Baseline table access (RLS below does the real gatekeeping)
-- ---------------------------------------------------------------------

grant usage on schema public to anon, authenticated;
grant select on all tables in schema public to anon;
grant select, insert, update, delete on all tables in schema public to authenticated;

-- ---------------------------------------------------------------------
-- Helper functions (security definer so they can check roles
-- without recursing back into the RLS policy that calls them)
-- ---------------------------------------------------------------------

create or replace function public.is_staff()
returns boolean language sql security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role in ('admin','owner'));
$$;

create or replace function public.is_owner()
returns boolean language sql security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'owner');
$$;

create or replace function public.owner_exists()
returns boolean language sql security definer set search_path = public as $$
  select exists (select 1 from profiles where role = 'owner');
$$;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------

alter table profiles enable row level security;
alter table products enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table order_status_history enable row level security;
alter table custom_requests enable row level security;
alter table request_status_history enable row level security;
alter table things enable row level security;
alter table settings enable row level security;

-- profiles: you can see your own row; staff can see everyone
create policy "profiles_select" on profiles for select
  using (id = auth.uid() or is_staff());

create policy "profiles_insert_self" on profiles for insert
  with check (id = auth.uid());

-- the very first person to trigger the admin phrase becomes Owner
create policy "profiles_bootstrap_owner" on profiles for update
  using (id = auth.uid() and not owner_exists())
  with check (id = auth.uid() and role = 'owner');

-- after that, only the Owner can change anyone's role
create policy "profiles_update_by_owner" on profiles for update
  using (is_owner()) with check (is_owner());

-- products: visible if available, or you're staff. Only staff can write.
create policy "products_read" on products for select
  using (available = true or is_staff());
create policy "products_write" on products for all
  using (is_staff()) with check (is_staff());

-- orders: created only via the place_order() function below.
-- customers can see their own; staff can see and update all.
create policy "orders_select" on orders for select
  using (user_id = auth.uid() or is_staff());
create policy "orders_update_staff" on orders for update
  using (is_staff()) with check (is_staff());

create policy "order_items_select" on order_items for select
  using (exists (select 1 from orders o where o.id = order_items.order_id
                 and (o.user_id = auth.uid() or is_staff())));

create policy "history_select" on order_status_history for select
  using (exists (select 1 from orders o where o.id = order_status_history.order_id
                 and (o.user_id = auth.uid() or is_staff())));
create policy "history_insert_staff" on order_status_history for insert
  with check (is_staff());

-- custom requests: customers create + read their own; staff manage all
create policy "requests_select" on custom_requests for select
  using (user_id = auth.uid() or is_staff());
create policy "requests_insert" on custom_requests for insert
  with check (user_id = auth.uid());
create policy "requests_update_staff" on custom_requests for update
  using (is_staff()) with check (is_staff());

create policy "request_history_select" on request_status_history for select
  using (exists (select 1 from custom_requests r where r.id = request_status_history.request_id
                 and (r.user_id = auth.uid() or is_staff())));
create policy "request_history_insert_staff" on request_status_history for insert
  with check (is_staff());

-- things: published posts are public; drafts + writing are staff-only
create policy "things_read" on things for select
  using (published = true or is_staff());
create policy "things_write" on things for all
  using (is_staff()) with check (is_staff());

-- settings: readable by everyone, editable by staff
create policy "settings_read" on settings for select using (true);
create policy "settings_write" on settings for all
  using (is_staff()) with check (is_staff());

-- ---------------------------------------------------------------------
-- place_order(): the only way orders get created.
-- Runs as security definer so it can safely decrement stock
-- (customers otherwise have no write access to products), and
-- checks/locks stock so two people can't buy the last item at once.
-- ---------------------------------------------------------------------

create or replace function public.place_order(p_order_id text, p_items jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_username text;
  v_item jsonb;
  v_product products%rowtype;
  v_total numeric := 0;
begin
  if v_user_id is null then
    raise exception 'Must be logged in to place an order';
  end if;

  select username into v_username from profiles where id = v_user_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_product from products where id = (v_item->>'product_id')::uuid for update;
    if not found then
      raise exception 'Product not found';
    end if;
    if v_product.stock < (v_item->>'qty')::int then
      raise exception 'Not enough stock for %', v_product.name;
    end if;
  end loop;

  insert into orders (id, user_id, username, total, payment_status, stage)
  values (p_order_id, v_user_id, v_username, 0, 'Payment Pending', 'Order Placed');

  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_product from products where id = (v_item->>'product_id')::uuid;

    insert into order_items (order_id, product_id, name, price, qty)
    values (p_order_id, v_product.id, v_product.name, v_product.price, (v_item->>'qty')::int);

    update products set stock = stock - (v_item->>'qty')::int where id = v_product.id;

    v_total := v_total + v_product.price * (v_item->>'qty')::int;
  end loop;

  update orders set total = v_total where id = p_order_id;
  insert into order_status_history (order_id, stage) values (p_order_id, 'Order Placed');
end;
$$;

grant execute on function public.place_order(text, jsonb) to authenticated;
