-- =====================================================
-- J.A.R.V.I.S. — ALBERO GENEALOGICO: aggiornamento 1
-- Esegui TUTTO nell'SQL Editor del progetto Supabase di JARVIS, DOPO albero_genealogia.sql.
-- Idempotente: si puo' rieseguire senza danni.
-- Aggiunge: foto profilo, biografia, tipo di unione, separazione/divorzio,
-- condivisione per ramo (antenati/discendenti di una persona), scheda e biografia nel link pubblico.
-- =====================================================

alter table gen_persone add column if not exists foto_percorso text;
alter table gen_persone add column if not exists biografia text;

alter table gen_famiglie add column if not exists tipo_unione text not null default 'matrimonio';
alter table gen_famiglie drop constraint if exists gen_famiglie_tipo_unione_check;
alter table gen_famiglie add constraint gen_famiglie_tipo_unione_check check (tipo_unione in ('matrimonio','convivenza','altro'));

alter table gen_eventi drop constraint if exists gen_eventi_tipo_check;
alter table gen_eventi add constraint gen_eventi_tipo_check
  check (tipo in ('nascita','morte','matrimonio','separazione','divorzio','residenza','ordinazione','altro'));

alter table gen_condivisioni add column if not exists persona_radice_id uuid references gen_persone(id) on delete cascade;
alter table gen_condivisioni add column if not exists ramo text not null default 'tutto';
alter table gen_condivisioni drop constraint if exists gen_condivisioni_ramo_check;
alter table gen_condivisioni add constraint gen_condivisioni_ramo_check check (ramo in ('tutto','antenati','discendenti','entrambi'));

-- ---------- Link pubblico: sola lettura, viventi oscurati, opzionalmente limitato a un ramo ----------
-- Vivente = stato 'vivente', oppure 'auto' senza data di morte, nato negli ultimi 100 anni (o nascita
-- sconosciuta) e senza figli nati da oltre 90 anni. Per i viventi: nome "Vivente", niente date, luoghi,
-- note, biografia. Mai condivisi: note, fonti, documenti, foto.
create or replace function gen_albero_pubblico(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare v uuid; rad uuid; modo text; res jsonb;
begin
  select user_id, persona_radice_id, ramo into v, rad, modo from gen_condivisioni where token = p_token and attiva;
  if v is null then return null; end if;
  if modo = 'tutto' then rad := null; end if;

  with recursive
  su(id) as (
    select rad where rad is not null and modo in ('antenati','entrambi')
    union
    select x.c from su join gen_figli fg on fg.persona_id = su.id
      join gen_famiglie f on f.id = fg.famiglia_id
      cross join lateral (values (f.coniuge1_id), (f.coniuge2_id)) x(c) where x.c is not null
  ),
  giu(id) as (
    select rad where rad is not null and modo in ('discendenti','entrambi')
    union
    select fg.persona_id from giu join gen_famiglie f on giu.id in (f.coniuge1_id, f.coniuge2_id)
      join gen_figli fg on fg.famiglia_id = f.id
  ),
  coniugi(id) as (
    select x.c from giu join gen_famiglie f on giu.id in (f.coniuge1_id, f.coniuge2_id)
      cross join lateral (values (f.coniuge1_id), (f.coniuge2_id)) x(c) where x.c is not null
  ),
  ramo as (select id from su union select id from giu union select id from coniugi),
  pv as (
    select pe.id,
      (pe.stato_vita = 'vivente' or (pe.stato_vita = 'auto'
        and not exists (select 1 from gen_eventi e where e.persona_id = pe.id and e.tipo = 'morte')
        and not exists (select 1 from gen_famiglie f join gen_figli fg on fg.famiglia_id = f.id
                        join gen_eventi e on e.persona_id = fg.persona_id and e.tipo = 'nascita' and e.data_iso is not null
                        where pe.id in (f.coniuge1_id, f.coniuge2_id)
                          and extract(year from e.data_iso)::int <= extract(year from now())::int - 90)
        and coalesce((select extract(year from min(e.data_iso))::int from gen_eventi e where e.persona_id = pe.id and e.tipo = 'nascita'),
                     extract(year from now())::int) > extract(year from now())::int - 100)) as vivente
    from gen_persone pe
    where pe.user_id = v and (rad is null or pe.id in (select id from ramo))
  ),
  ev as (
    select e.* from gen_eventi e
    where e.user_id = v
      and (e.persona_id is null or exists (select 1 from pv where pv.id = e.persona_id and not pv.vivente))
      and (e.persona_id is not null or exists (
            select 1 from gen_famiglie f where f.id = e.famiglia_id
              and exists (select 1 from pv where pv.id in (f.coniuge1_id, f.coniuge2_id))
              and not exists (select 1 from pv where pv.id in (f.coniuge1_id, f.coniuge2_id) and pv.vivente)))
  )
  select jsonb_build_object(
    'radice', rad,
    'persone', coalesce((select jsonb_agg(jsonb_build_object(
        'id', pe.id, 'nome', case when pv.vivente then 'Vivente' else pe.nome end,
        'cognome', pe.cognome, 'sesso', pe.sesso, 'vivente', pv.vivente,
        'biografia', case when pv.vivente then null else pe.biografia end))
      from gen_persone pe join pv on pv.id = pe.id where pe.user_id = v), '[]'::jsonb),
    'famiglie', coalesce((select jsonb_agg(jsonb_build_object(
        'id', f.id,
        'coniuge1_id', case when f.coniuge1_id in (select id from pv) then f.coniuge1_id end,
        'coniuge2_id', case when f.coniuge2_id in (select id from pv) then f.coniuge2_id end,
        'tipo_unione', f.tipo_unione))
      from gen_famiglie f where f.user_id = v and (f.coniuge1_id in (select id from pv) or f.coniuge2_id in (select id from pv)
        or exists (select 1 from gen_figli fg where fg.famiglia_id = f.id and fg.persona_id in (select id from pv)))), '[]'::jsonb),
    'figli', coalesce((select jsonb_agg(jsonb_build_object('famiglia_id', fg.famiglia_id, 'persona_id', fg.persona_id, 'ordine', fg.ordine))
      from gen_figli fg where fg.user_id = v and fg.persona_id in (select id from pv)), '[]'::jsonb),
    'eventi', coalesce((select jsonb_agg(jsonb_build_object(
        'id', id, 'persona_id', persona_id, 'famiglia_id', famiglia_id, 'tipo', tipo, 'titolo', titolo,
        'data_testo', data_testo, 'data_iso', data_iso, 'precisione', precisione, 'luogo_id', luogo_id, 'luogo_testo', luogo_testo))
      from ev), '[]'::jsonb),
    'luoghi', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'nome', l.nome, 'lat', l.lat, 'lng', l.lng))
      from gen_luoghi l where l.user_id = v and l.id in (select luogo_id from ev where luogo_id is not null)), '[]'::jsonb)
  ) into res;
  return res;
end
$fn$;

revoke all on function gen_albero_pubblico(text) from public;
grant execute on function gen_albero_pubblico(text) to anon, authenticated;
