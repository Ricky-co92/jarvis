-- =====================================================
-- J.A.R.V.I.S. — Modulo ALBERO GENEALOGICO
-- Esegui TUTTO questo file nell'SQL Editor del progetto Supabase di JARVIS.
-- Sicuro da rieseguire: crea le tabelle solo se mancano; l'import finale
-- si blocca da solo se l'albero e' gia' stato importato.
-- =====================================================

create table if not exists gen_luoghi (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome text not null,
  lat double precision,
  lng double precision,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists gen_persone (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome text,
  cognome text,
  sesso text not null default 'U' check (sesso in ('M','F','U')),
  stato_vita text not null default 'auto' check (stato_vita in ('auto','vivente','deceduto')),
  note text,
  rif_gedcom text,
  created_at timestamptz not null default now()
);

create table if not exists gen_famiglie (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  coniuge1_id uuid references gen_persone(id) on delete set null,
  coniuge2_id uuid references gen_persone(id) on delete set null,
  note text,
  rif_gedcom text,
  created_at timestamptz not null default now()
);

create table if not exists gen_figli (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  famiglia_id uuid not null references gen_famiglie(id) on delete cascade,
  persona_id uuid not null references gen_persone(id) on delete cascade,
  ordine int not null default 0,
  primary key (famiglia_id, persona_id)
);

create table if not exists gen_eventi (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  persona_id uuid references gen_persone(id) on delete cascade,
  famiglia_id uuid references gen_famiglie(id) on delete cascade,
  tipo text not null default 'altro' check (tipo in ('nascita','morte','matrimonio','residenza','ordinazione','altro')),
  titolo text,
  data_testo text,
  data_iso date,
  precisione text not null default 'testo' check (precisione in ('giorno','mese','anno','testo')),
  luogo_id uuid references gen_luoghi(id) on delete set null,
  luogo_testo text,
  note text,
  created_at timestamptz not null default now(),
  check (persona_id is not null or famiglia_id is not null)
);

create table if not exists gen_fonti (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  persona_id uuid references gen_persone(id) on delete cascade,
  evento_id uuid references gen_eventi(id) on delete set null,
  titolo text not null,
  tipo text,
  url text,
  archivio text,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists gen_documenti (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  persona_id uuid references gen_persone(id) on delete cascade,
  fonte_id uuid references gen_fonti(id) on delete set null,
  nome text not null,
  percorso text not null,
  mime text,
  created_at timestamptz not null default now()
);

create table if not exists gen_condivisioni (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  token text not null unique default (replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','')),
  etichetta text,
  attiva boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists gen_eventi_persona_idx on gen_eventi(persona_id);
create index if not exists gen_figli_persona_idx on gen_figli(persona_id);
create index if not exists gen_fonti_persona_idx on gen_fonti(persona_id);
create index if not exists gen_documenti_persona_idx on gen_documenti(persona_id);

-- ---------- RLS: ogni tabella visibile solo al proprietario ----------
do $rls$
declare t text;
begin
  foreach t in array array['gen_luoghi','gen_persone','gen_famiglie','gen_figli','gen_eventi','gen_fonti','gen_documenti','gen_condivisioni']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_proprietario', t);
    execute format('create policy %I on %I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t || '_proprietario', t);
  end loop;
end
$rls$;

-- ---------- Storage privato per i documenti (cartella = user id) ----------
insert into storage.buckets (id, name, public) values ('gen-documenti', 'gen-documenti', false)
on conflict (id) do nothing;

drop policy if exists gen_documenti_storage on storage.objects;
create policy gen_documenti_storage on storage.objects for all to authenticated
  using (bucket_id = 'gen-documenti' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'gen-documenti' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- Condivisione parenti: sola lettura, viventi oscurati ----------
-- Vivente = stato 'vivente', oppure 'auto' senza data di morte, nato negli ultimi 100 anni (o nascita
-- sconosciuta) e senza figli nati da oltre 90 anni (in quel caso e' considerato deceduto). Per i viventi: nome "Vivente", niente date, luoghi, note, fonti.
create or replace function gen_albero_pubblico(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare v uuid; res jsonb;
begin
  select user_id into v from gen_condivisioni where token = p_token and attiva;
  if v is null then return null; end if;

  with pv as (
    select pe.id,
      (pe.stato_vita = 'vivente' or (pe.stato_vita = 'auto'
        and not exists (select 1 from gen_eventi e where e.persona_id = pe.id and e.tipo = 'morte')
        and not exists (select 1 from gen_famiglie f join gen_figli fg on fg.famiglia_id = f.id
                        join gen_eventi e on e.persona_id = fg.persona_id and e.tipo = 'nascita' and e.data_iso is not null
                        where pe.id in (f.coniuge1_id, f.coniuge2_id)
                          and extract(year from e.data_iso)::int <= extract(year from now())::int - 90)
        and coalesce((select extract(year from min(e.data_iso))::int from gen_eventi e where e.persona_id = pe.id and e.tipo = 'nascita'),
                     extract(year from now())::int) > extract(year from now())::int - 100)) as vivente
    from gen_persone pe where pe.user_id = v
  ),
  ev as (
    select e.* from gen_eventi e
    where e.user_id = v
      and (e.persona_id is null or exists (select 1 from pv where pv.id = e.persona_id and not pv.vivente))
      and (e.famiglia_id is null or not exists (
            select 1 from gen_famiglie f join pv on pv.id in (f.coniuge1_id, f.coniuge2_id)
            where f.id = e.famiglia_id and pv.vivente))
  )
  select jsonb_build_object(
    'persone', coalesce((select jsonb_agg(jsonb_build_object(
        'id', pe.id, 'nome', case when pv.vivente then 'Vivente' else pe.nome end,
        'cognome', pe.cognome, 'sesso', pe.sesso, 'vivente', pv.vivente))
      from gen_persone pe join pv on pv.id = pe.id where pe.user_id = v), '[]'::jsonb),
    'famiglie', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'coniuge1_id', coniuge1_id, 'coniuge2_id', coniuge2_id))
      from gen_famiglie where user_id = v), '[]'::jsonb),
    'figli', coalesce((select jsonb_agg(jsonb_build_object('famiglia_id', famiglia_id, 'persona_id', persona_id, 'ordine', ordine))
      from gen_figli where user_id = v), '[]'::jsonb),
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

-- =====================================================
-- IMPORT DATI da 'Costa Albero genealogico.ged' (Ancestry, 02/11/2026)
-- Utente proprietario: riccardo@costariccardo.com
-- =====================================================
do $import$
declare v uuid;
begin
  select id into v from auth.users where email = 'riccardo@costariccardo.com';
  if v is null then raise exception 'Utente riccardo@costariccardo.com non trovato in auth.users'; end if;
  if exists (select 1 from gen_persone where user_id = v) then raise exception 'Albero gia'' importato: nessuna operazione eseguita'; end if;
  insert into gen_luoghi (user_id, nome, lat, lng, note) values
    (v, 'Argentina', null, null, null),
    (v, 'Buccino, Salerno, Campania, Italia', 40.635, 15.379, 'coordinate approssimative, da verificare'),
    (v, 'Busalla, Genova, Liguria, Italia', 44.5724, 8.9429, 'coordinate approssimative, da verificare'),
    (v, 'Casale Monferrato, Alessandria, Piemonte, Italia', 45.1349, 8.4506, 'coordinate approssimative, da verificare'),
    (v, 'Fardella, Potenza, Basilicata, Italia', 40.16, 16.185, 'coordinate approssimative, da verificare'),
    (v, 'Genova, Liguria, Italia', 44.4056, 8.9463, 'coordinate approssimative, da verificare'),
    (v, 'Italia', null, null, null),
    (v, 'Ozzano Monferrato, Alessandria, Piemonte, Italia', 45.087, 8.398, 'coordinate approssimative, da verificare'),
    (v, 'Winterthur, Zurigo, Svizzera', 47.4988, 8.7237, 'coordinate approssimative, da verificare');
  insert into gen_persone (user_id, nome, cognome, sesso, rif_gedcom) values
    (v, 'Riccardo', 'Costa', 'M', 'I282647190319'),
    (v, 'Maria Antonietta', 'Salimbene', 'F', 'I282647190358'),
    (v, 'Sergio', 'Costa', 'M', 'I282647190375'),
    (v, 'Immacolata', 'Trupa', 'F', 'I282647190451'),
    (v, 'Gerardo', 'Salimbene', 'M', 'I282647190474'),
    (v, 'Anna Maria Caterina', 'Repetto', 'F', 'I282647190514'),
    (v, 'Ugo', 'Costa', 'M', 'I282647190526'),
    (v, 'Clara', 'Costa', 'F', 'I282647190561'),
    (v, 'Alessandra', 'Costa', 'F', 'I282647190589'),
    (v, 'Domenico', 'Costa', 'M', 'I282647190607'),
    (v, 'Maria Cristina', 'Costa', 'F', 'I282647190619'),
    (v, 'Carmine', 'Salimbene', 'M', 'I282647190649'),
    (v, 'Nadia', 'Salimbene', 'F', 'I282647190660'),
    (v, 'Ernesto', 'Costa', 'M', 'I282647190690'),
    (v, 'Graziosa', 'Sangiacomo', 'F', 'I282647190710'),
    (v, 'Emanuele', 'Costa', 'M', 'I282647190727'),
    (v, 'Giovanna', 'Repetto', 'F', 'I282647190753'),
    (v, 'Marco', 'Costa', 'M', 'I282647190760'),
    (v, 'Carla', 'Costa', 'F', 'I282647190765'),
    (v, 'Giorgio', 'Costa', 'M', 'I282647190767'),
    (v, 'Mario', 'Minelli', 'M', 'I282647190794'),
    (v, 'Matteo', 'Minelli', 'M', 'I282647190803'),
    (v, 'Andrea', 'Minalli', 'M', 'I282647190815'),
    (v, 'Giulia', 'Minalli', 'F', 'I282647190820'),
    (v, 'Franca', 'Merlo', 'F', 'I282647190841'),
    (v, 'Alberto', 'Costa', 'M', 'I282647190853'),
    (v, 'Luigi', 'Costa', 'M', 'I282647190859'),
    (v, 'Maria Rosa', 'Costa', 'F', 'I282647190870'),
    (v, 'Padre Aldo', 'Costa', 'M', 'I282647190877'),
    (v, 'Virginia', 'Mazzarello', 'F', 'I282647190906'),
    (v, 'Giacomo Paolo', 'Costa', 'M', 'I282647190915'),
    (v, 'Renato', 'Costa', 'M', 'I282647190921'),
    (v, 'Paola', 'Puppo', 'F', 'I282647190947'),
    (v, 'Valentina', 'Costa', 'F', 'I282647190950'),
    (v, 'Davide', 'Costa', 'M', 'I282647190957'),
    (v, 'Erika', 'Picasso', 'F', 'I282647190962'),
    (v, 'Emma', 'Costa', 'F', 'I282647190968'),
    (v, 'Patrizia', 'Bondanza', 'F', 'I282647190983'),
    (v, 'Francesco', 'Costa', 'M', 'I282647191003'),
    (v, 'Marta', 'di Francesco', 'F', 'I282647191015'),
    (v, 'Luca', 'Costa', 'M', 'I282647191035'),
    (v, 'Lorenzo', 'Costa', 'M', 'I282647191040'),
    (v, 'Luigi', 'Balostro', 'M', 'I282647191054'),
    (v, 'Maria Grazia', 'Balostro', 'F', 'I282647191176'),
    (v, 'Lorenzo Carlo', 'Balostro', 'M', 'I282647191202'),
    (v, 'Maria Teresa', 'Balostro', 'F', 'I282647191246'),
    (v, 'Domenico', 'Mastrorosa', 'M', 'I282647191264'),
    (v, 'Simone', 'Mastrorosa', 'M', 'I282647191269'),
    (v, 'Elisa', 'Reale', 'F', 'I282647191296'),
    (v, 'Andrea', 'Balostro', 'M', 'I282647191304'),
    (v, 'Stefano', 'Balostro', 'M', 'I282647191314'),
    (v, 'Debora', 'Cosenza', 'F', 'I282647191332'),
    (v, 'Alessio', 'Balostro', 'M', 'I282647191341'),
    (v, 'Martina', 'Balostro', 'F', 'I282647191350'),
    (v, 'Luigi Mario', 'Repetto', 'M', 'I282647191397'),
    (v, 'Livia', 'Garre', 'F', 'I282647191401'),
    (v, 'Giovanni Battista', 'Repetto', 'M', 'I282647191408'),
    (v, 'Irma', 'Fidichiero', 'F', 'I282647191423'),
    (v, 'Silvano', 'Repetto', 'M', 'I282647191428'),
    (v, 'Maria Assunta', 'Repetto', 'F', 'I282647191468'),
    (v, 'Giacomo', 'Repetto', 'M', 'I282647191488'),
    (v, 'Guido', 'Repetto', 'M', 'I282647191499'),
    (v, 'Iolanda', 'Salvarezza', 'F', 'I282647191511'),
    (v, 'Daniela', 'Reghitto', 'F', 'I282647191548'),
    (v, 'Sara', 'Repetto', 'F', 'I282647191553'),
    (v, 'Alessandro', 'Repetto', 'M', 'I282647191568'),
    (v, 'Alessandra', 'Delucchi', 'F', 'I282647191592'),
    (v, 'Pietro', 'Costa', 'M', 'I282647191599'),
    (v, 'Pietro', 'Salimbene', 'M', 'I282647191612'),
    (v, 'Marilena', 'Salimbene', 'F', 'I282647191616'),
    (v, 'Ilaria', 'Salimbene', 'F', 'I282647191622'),
    (v, 'Antonio', 'Trupa', 'M', 'I282647246385'),
    (v, '?', null, 'F', 'I282647246386'),
    (v, '?', null, 'M', 'I282647246387'),
    (v, 'Antonio', 'Trupa', 'M', 'I282647246462'),
    (v, 'Maria', 'Crisci', 'F', 'I282647246463'),
    (v, 'Biase', 'Trupa', 'M', 'I282647246464'),
    (v, 'Antonietta', null, 'F', 'I282647246509'),
    (v, 'Carmine', 'Salimbene', 'M', 'I282647247021'),
    (v, 'Antonietta', 'Luordo', 'F', 'I282647247037'),
    (v, 'Bryan', 'Salimbene', 'M', 'I282647247120'),
    (v, 'Nikolas', 'Salimbene', 'M', 'I282647247191'),
    (v, 'Zoccola', null, 'F', 'I282647247249'),
    (v, 'Vinzenzo', 'De Carlo', 'M', 'I282647247328'),
    (v, 'Erminio', 'De Duonni', 'M', 'I282647247443'),
    (v, 'Roberto', 'Gallaro', 'M', 'I282647266819'),
    (v, 'Enea', 'Vescovelli', 'M', 'I282647546221'),
    (v, 'Paolo', 'Pezzano', 'M', 'I282647553334'),
    (v, 'Martino', 'Costa', 'M', 'I282689470788'),
    (v, 'Matteo', 'Costa', 'U', 'I282689470862'),
    (v, 'Pierre', 'Sorrenti', 'M', 'I282689470989'),
    (v, 'Arianna', 'Varlani', 'F', 'I282689471599'),
    (v, 'Valerio', 'Daga', 'M', 'I282689471625'),
    (v, 'Francesca', 'Sassi', 'F', 'I282689471669'),
    (v, 'Alessandro', 'Violante', 'M', 'I282696819271'),
    (v, '?', null, 'M', 'I282701501403'),
    (v, '?', null, 'F', 'I282701501404'),
    (v, 'Pietro', 'Repetto', 'U', 'I282701501405'),
    (v, 'Angela', 'Repetto', 'U', 'I282701501427'),
    (v, 'Angela', 'Repetto', 'U', 'I282701501476'),
    (v, 'Angela', 'Repetto', 'U', 'I282701501498'),
    (v, 'Assunta', 'Repetto', 'U', 'I282701501563'),
    (v, 'Mariangela', 'Repetto', 'F', 'I282701501606'),
    (v, 'Giacomo', 'Repetto', 'M', 'I282701501619'),
    (v, 'Mario', 'Mereta', 'M', 'I282701501643'),
    (v, 'Natalina', 'Tavella', 'M', 'I282701501727'),
    (v, 'Salvatore', 'Salimbene', 'U', 'I282702581124'),
    (v, 'Andrea', 'Costa', 'U', 'I282702581169'),
    (v, 'Bianca', 'Sorrenti', 'F', 'I282721486742');
  insert into gen_famiglie (user_id, coniuge1_id, coniuge2_id, rif_gedcom)
  select v, (select id from gen_persone where user_id = v and rif_gedcom = t.h), (select id from gen_persone where user_id = v and rif_gedcom = t.w), t.f
  from (values
    ('F1', 'I282647190375', 'I282647190358'),
    ('F2', 'I282647191054', 'I282647190870'),
    ('F3', 'I282647191499', 'I282647191511'),
    ('F4', 'I282647247443', 'I282647190660'),
    ('F5', 'I282701501727', 'I282701501405'),
    ('F6', 'I282696819271', 'I282647190950'),
    ('F7', 'I282647191003', 'I282647191015'),
    ('F8', 'I282647190853', 'I282647190906'),
    ('F9', 'I282647190727', 'I282647190753'),
    ('F10', 'I282647190921', 'I282647190983'),
    ('F11', 'I282647190607', 'I282647191592'),
    ('F12', 'I282647190474', 'I282647190451'),
    ('F13', 'I282647191408', 'I282647191423'),
    ('F14', 'I282647190526', 'I282647190514'),
    ('F15', 'I282647191428', 'I282647191548'),
    ('F16', 'I282647246463', 'I282647246464'),
    ('F17', 'I282647246462', 'I282647246509'),
    ('F18', 'I282647191397', 'I282647191401'),
    ('F19', 'I282647191264', 'I282647191176'),
    ('F20', 'I282647191568', 'I282689471599'),
    ('F21', 'I282701501606', 'I282701501643'),
    ('F22', 'I282647247328', 'I282647190660'),
    ('F23', 'I282647546221', 'I282647190820'),
    ('F24', 'I282647190794', 'I282647190765'),
    ('F25', 'I282647190760', 'I282647190841'),
    ('F26', 'I282647191612', 'I282647247249'),
    ('F27', 'I282701501403', 'I282701501404'),
    ('F28', 'I282689471625', 'I282647191553'),
    ('F29', 'I282647191202', 'I282647191296'),
    ('F30', 'I282647190915', 'I282647190947'),
    ('F31', 'I282689470989', 'I282647191350'),
    ('F32', 'I282647191304', 'I282647191332'),
    ('F33', 'I282647190690', 'I282647190710'),
    ('F34', 'I282647246386', 'I282647246387'),
    ('F35', 'I282647190957', 'I282647190962'),
    ('F36', 'I282647553334', 'I282647190589'),
    ('F37', 'I282647247021', 'I282647247037'),
    ('F38', 'I282647191341', 'I282689471669'),
    ('F39', 'I282647191054', null),
    ('F40', null, 'I282647247249'),
    ('F41', null, 'I282647190870')
  ) as t(f, h, w);
  insert into gen_figli (user_id, famiglia_id, persona_id, ordine)
  select v, f.id, p.id, t.o
  from (values
    ('F1', 'I282647190319', 0),
    ('F1', 'I282647190561', 1),
    ('F1', 'I282647190589', 2),
    ('F2', 'I282647191176', 0),
    ('F4', 'I282647191616', 0),
    ('F4', 'I282647191622', 1),
    ('F5', 'I282701501619', 0),
    ('F5', 'I282701501606', 1),
    ('F7', 'I282647191035', 0),
    ('F7', 'I282689470862', 1),
    ('F8', 'I282647190915', 0),
    ('F8', 'I282647190921', 1),
    ('F9', 'I282647190760', 0),
    ('F9', 'I282647190765', 1),
    ('F9', 'I282647190767', 2),
    ('F10', 'I282647191003', 0),
    ('F10', 'I282647191040', 1),
    ('F11', 'I282647191599', 0),
    ('F12', 'I282647190649', 0),
    ('F12', 'I282702581124', 1),
    ('F12', 'I282647190358', 2),
    ('F12', 'I282647190660', 3),
    ('F13', 'I282647191428', 0),
    ('F14', 'I282647190375', 0),
    ('F14', 'I282702581169', 1),
    ('F14', 'I282647190607', 2),
    ('F14', 'I282647190619', 3),
    ('F15', 'I282647191553', 0),
    ('F15', 'I282647191568', 1),
    ('F16', 'I282647246462', 0),
    ('F16', 'I282647190451', 1),
    ('F18', 'I282647191408', 0),
    ('F18', 'I282647191468', 1),
    ('F18', 'I282647191488', 2),
    ('F18', 'I282647191499', 3),
    ('F18', 'I282647190514', 4),
    ('F19', 'I282647191269', 0),
    ('F22', 'I282647191612', 0),
    ('F24', 'I282647190803', 0),
    ('F24', 'I282647190815', 1),
    ('F24', 'I282647190820', 2),
    ('F26', 'I282647247120', 0),
    ('F26', 'I282647247191', 1),
    ('F27', 'I282647191397', 0),
    ('F27', 'I282701501405', 1),
    ('F27', 'I282701501498', 2),
    ('F27', 'I282701501563', 3),
    ('F29', 'I282647191304', 0),
    ('F29', 'I282647191314', 1),
    ('F30', 'I282647190950', 0),
    ('F30', 'I282647190957', 1),
    ('F31', 'I282721486742', 0),
    ('F32', 'I282647191341', 0),
    ('F32', 'I282647191350', 1),
    ('F33', 'I282647190853', 0),
    ('F33', 'I282647190859', 1),
    ('F33', 'I282647190526', 2),
    ('F33', 'I282647190870', 3),
    ('F33', 'I282647190877', 4),
    ('F33', 'I282647190727', 5),
    ('F34', 'I282647190451', 0),
    ('F34', 'I282647246385', 1),
    ('F35', 'I282647190968', 0),
    ('F35', 'I282689470788', 1),
    ('F37', 'I282647190474', 0),
    ('F39', 'I282647191246', 0),
    ('F40', 'I282647266819', 0),
    ('F41', 'I282647191202', 0)
  ) as t(f, c, o)
  join gen_famiglie f on f.user_id = v and f.rif_gedcom = t.f
  join gen_persone p on p.user_id = v and p.rif_gedcom = t.c;
  insert into gen_eventi (user_id, persona_id, tipo, titolo, data_testo, data_iso, precisione, luogo_id, luogo_testo)
  select v, p.id, t.tipo, t.titolo, t.dt, t.di::date, t.prec, l.id, t.lt
  from (values
    ('I282647190319', 'nascita', null, '28 Mag 1992', '1992-05-28', 'giorno', 'Casale Monferrato, Alessandria, Piemonte, Italia', 'Casale Monferrato, Alessandria, Piemonte, Italia'),
    ('I282647190358', 'nascita', null, '1967', '1967-01-01', 'anno', 'Buccino, Salerno, Campania, Italia', 'Buccino, Salerno, Campania, Italy'),
    ('I282647190358', 'residenza', null, null, null, 'testo', 'Buccino, Salerno, Campania, Italia', 'Buccino, Salerno, Campania, Italy'),
    ('I282647190375', 'nascita', null, '1965', '1965-01-01', 'anno', 'Busalla, Genova, Liguria, Italia', 'Busalla, Genova, Liguria, Italy'),
    ('I282647190375', 'residenza', null, null, null, 'testo', 'Busalla, Genova, Liguria, Italia', 'Busalla, Genova, Liguria, Italy'),
    ('I282647190451', 'nascita', null, '01 Lug 1940', '1940-07-01', 'giorno', 'Fardella, Potenza, Basilicata, Italia', 'Fardella, Potenza, Basilicata, Italia'),
    ('I282647190451', 'residenza', null, null, null, 'testo', 'Italia', 'Italy'),
    ('I282647190451', 'morte', null, '29 Mar 2008', '2008-03-29', 'giorno', 'Italia', 'Italy'),
    ('I282647190474', 'nascita', null, '27 aprile 1940', '1940-04-27', 'giorno', 'Buccino, Salerno, Campania, Italia', 'Buccino, Salerno, Campania, Italia'),
    ('I282647190474', 'residenza', null, null, null, 'testo', 'Ozzano Monferrato, Alessandria, Piemonte, Italia', 'Ozzano Monferrato, Alessandria, Piemonte, Italy'),
    ('I282647190474', 'morte', null, 'agosto 1995', '1995-08-01', 'mese', 'Ozzano Monferrato, Alessandria, Piemonte, Italia', 'Ozzano Monferrato, Alessandria, Piemonte, Italy'),
    ('I282647190514', 'nascita', null, '27 Mag 1936', '1936-05-27', 'giorno', 'Busalla, Genova, Liguria, Italia', 'Busalla, Genova, Liguria, Italy'),
    ('I282647190514', 'residenza', null, null, null, 'testo', 'Busalla, Genova, Liguria, Italia', 'Busalla, Genova, Liguria, Italy'),
    ('I282647190514', 'morte', null, '6 Ago 2016', '2016-08-06', 'giorno', 'Busalla, Genova, Liguria, Italia', 'Busalla, Genova, Liguria, Italy'),
    ('I282647190526', 'nascita', null, '11 Apr 1924', '1924-04-11', 'giorno', 'Busalla, Genova, Liguria, Italia', 'Busalla, Genova, Liguria, Italy'),
    ('I282647190526', 'residenza', null, null, null, 'testo', 'Busalla, Genova, Liguria, Italia', 'Busalla, Genova, Liguria, Italy'),
    ('I282647190526', 'morte', null, '15 Giu 2012', '2012-06-15', 'giorno', 'Busalla, Genova, Liguria, Italia', 'Busalla, Genova, Liguria, Italy'),
    ('I282647190561', 'nascita', null, '16 Lug 1997', '1997-07-16', 'giorno', 'Casale Monferrato, Alessandria, Piemonte, Italia', 'Casale Monferrato, Alessandria, Piemonte, Italia'),
    ('I282647190589', 'nascita', null, '25 Ago 1999', '1999-08-25', 'giorno', 'Casale Monferrato, Alessandria, Piemonte, Italia', 'Casale Monferrato, Alessandria, Piemonte, Italia'),
    ('I282647190607', 'nascita', null, '23 Mag 1967', '1967-05-23', 'giorno', 'Busalla, Genova, Liguria, Italia', 'Busalla, Genova, Liguria, Italy'),
    ('I282647190619', 'nascita', null, '15 Giu 1975', '1975-06-15', 'giorno', 'Genova, Liguria, Italia', 'Genova, Liguria, Italia'),
    ('I282647190649', 'nascita', null, '20 Feb 1965', '1965-02-20', 'giorno', 'Winterthur, Zurigo, Svizzera', 'Winterthur, Zurigo, Svizzera'),
    ('I282647190660', 'nascita', null, '17 maggio 1972', '1972-05-17', 'giorno', 'Casale Monferrato, Alessandria, Piemonte, Italia', 'Casale Monferrato, Alessandria, Piemonte, Italia'),
    ('I282647190727', 'nascita', null, '16 marzo 1930', '1930-03-16', 'giorno', null, null),
    ('I282647190727', 'morte', null, '01 aprile 2003', '2003-04-01', 'giorno', null, null),
    ('I282647190753', 'nascita', null, '15 Gen 1935', '1935-01-15', 'giorno', null, null),
    ('I282647190760', 'nascita', null, '2 Feb 1964', '1964-02-02', 'giorno', null, null),
    ('I282647190765', 'nascita', null, '29 Lug 1965', '1965-07-29', 'giorno', null, null),
    ('I282647190767', 'nascita', null, '16 Set 1966', '1966-09-16', 'giorno', null, null),
    ('I282647190794', 'nascita', null, '11 Mag 1967', '1967-05-11', 'giorno', null, null),
    ('I282647190803', 'nascita', null, '18 Set 1997', '1997-09-18', 'giorno', null, null),
    ('I282647190815', 'nascita', null, '17 Dic 1998', '1998-12-17', 'giorno', null, null),
    ('I282647190820', 'nascita', null, '25 Giu 2002', '2002-06-25', 'giorno', 'Genova, Liguria, Italia', 'Genova, Genova, Liguria, Italia'),
    ('I282647190841', 'nascita', null, '14 ottobre 1960', '1960-10-14', 'giorno', null, null),
    ('I282647190853', 'nascita', null, '1920', '1920-01-01', 'anno', null, null),
    ('I282647190853', 'morte', null, '1985', '1985-01-01', 'anno', null, null),
    ('I282647190859', 'nascita', null, '18 Set 1921', '1921-09-18', 'giorno', null, null),
    ('I282647190859', 'morte', null, '27 Set 1994', '1994-09-27', 'giorno', null, null),
    ('I282647190870', 'nascita', null, '1926', '1926-01-01', 'anno', null, null),
    ('I282647190870', 'morte', null, '1999', '1999-01-01', 'anno', null, null),
    ('I282647190877', 'nascita', null, '25 Gennaio 1928', '1928-01-25', 'giorno', null, null),
    ('I282647190877', 'ordinazione', 'Ordinazione', '1957', '1957-01-01', 'anno', null, null),
    ('I282647190877', 'morte', null, '13 Dicembre 2009', '2009-12-13', 'giorno', 'Argentina', 'Argentina'),
    ('I282647190915', 'nascita', null, '25 giugno 1954', '1954-06-25', 'giorno', null, null),
    ('I282647190921', 'nascita', null, '12 maggio 1956', '1956-05-12', 'giorno', null, null),
    ('I282647190921', 'morte', null, '2011', '2011-01-01', 'anno', null, null),
    ('I282647190947', 'nascita', null, '19 ottobre 1691', '1691-10-19', 'giorno', null, null),
    ('I282647190950', 'nascita', null, '07 novembre 1984', '1984-11-07', 'giorno', null, null),
    ('I282647190957', 'nascita', null, '28 febbraio 1990', '1990-02-28', 'giorno', null, null),
    ('I282647190962', 'nascita', null, '28 luglio 1988', '1988-07-28', 'giorno', null, null),
    ('I282647190968', 'nascita', null, '2 ottobre 2022', '2022-10-02', 'giorno', null, null),
    ('I282647190983', 'nascita', null, '19 novembre 1963', '1963-11-19', 'giorno', null, null),
    ('I282647191003', 'nascita', null, '11 luglio 1989', '1989-07-11', 'giorno', null, null),
    ('I282647191040', 'nascita', null, '3 settembre 1992', '1992-09-03', 'giorno', null, null),
    ('I282647191202', 'nascita', null, '10 agosto 1946', '1946-08-10', 'giorno', null, null),
    ('I282647191296', 'nascita', null, '25 marzo 1950', '1950-03-25', 'giorno', null, null),
    ('I282647191304', 'nascita', null, '03 giugno 1971', '1971-06-03', 'giorno', null, null),
    ('I282647191314', 'nascita', null, '7 maggio 1975', '1975-05-07', 'giorno', null, null),
    ('I282647191332', 'nascita', null, '11 febbraio 1971', '1971-02-11', 'giorno', null, null),
    ('I282647191341', 'nascita', null, '3 settembre 1998', '1998-09-03', 'giorno', null, null),
    ('I282647191350', 'nascita', null, '11 dicembre 2001', '2001-12-11', 'giorno', null, null),
    ('I282647191397', 'morte', null, '6 dicembre 1967', '1967-12-06', 'giorno', null, null),
    ('I282647191401', 'morte', null, '12 luglio 1981', '1981-07-12', 'giorno', null, null),
    ('I282647191408', 'nascita', null, '1921', '1921-01-01', 'anno', null, null),
    ('I282647191408', 'morte', null, 'Ottobre 1995', '1995-10-01', 'mese', null, null),
    ('I282647191423', 'morte', null, '2001', '2001-01-01', 'anno', null, null),
    ('I282647191428', 'nascita', null, '22 Ott 1961', '1961-10-22', 'giorno', null, null),
    ('I282647191468', 'nascita', null, '1924', '1924-01-01', 'anno', null, null),
    ('I282647191468', 'morte', null, '25 gennaio 2018', '2018-01-25', 'giorno', null, null),
    ('I282647191488', 'nascita', null, '1926', '1926-01-01', 'anno', null, null),
    ('I282647191488', 'morte', null, '04 giugno 2001', '2001-06-04', 'giorno', null, null),
    ('I282647191499', 'nascita', null, '1934', '1934-01-01', 'anno', null, null),
    ('I282647191511', 'nascita', null, '31 Mar 1945', '1945-03-31', 'giorno', null, null),
    ('I282647191548', 'nascita', null, '29 Dic 1966', '1966-12-29', 'giorno', null, null),
    ('I282647191553', 'nascita', null, '15 Mar 1995', '1995-03-15', 'giorno', null, null),
    ('I282647191568', 'nascita', null, '21 Gen 1998', '1998-01-21', 'giorno', null, null),
    ('I282647191599', 'nascita', null, '15 Mar 2003', '2003-03-15', 'giorno', null, null),
    ('I282647191612', 'nascita', null, '14 novembre 1994', '1994-11-14', 'giorno', null, null),
    ('I282647191616', 'nascita', null, '22 Ago 2001', '2001-08-22', 'giorno', 'Casale Monferrato, Alessandria, Piemonte, Italia', 'Casale Monferrato, Alessandria, Piemonte, Italia'),
    ('I282647191622', 'nascita', null, '25 marzo 2003', '2003-03-25', 'giorno', null, null),
    ('I282647246462', 'nascita', null, '11 Gen 1936', '1936-01-11', 'giorno', null, null),
    ('I282647247120', 'nascita', null, '04 giugno 2018', '2018-06-04', 'giorno', null, null),
    ('I282647247191', 'nascita', null, '02 febbraio 2024', '2024-02-02', 'giorno', null, null),
    ('I282647266819', 'nascita', null, '05 Febbraio 2016', '2016-02-05', 'giorno', null, null),
    ('I282647546221', 'nascita', null, '30 Mar 1998', '1998-03-30', 'giorno', null, null),
    ('I282689470788', 'nascita', null, '20 maggio 2025', '2025-05-20', 'giorno', null, null),
    ('I282689470989', 'nascita', null, '09 novembre 2003', '2003-11-09', 'giorno', null, null),
    ('I282689471599', 'nascita', null, '04 novembre 1999', '1999-11-04', 'giorno', null, null),
    ('I282689471669', 'nascita', null, '07 febbraio 1997', '1997-02-07', 'giorno', null, null),
    ('I282696819271', 'nascita', null, '7 novembre 1985', '1985-11-07', 'giorno', null, null),
    ('I282701501619', 'nascita', null, '1906', '1906-01-01', 'anno', null, null),
    ('I282702581124', 'nascita', null, '1966', '1966-01-01', 'anno', null, null),
    ('I282702581124', 'morte', null, '1966', '1966-01-01', 'anno', null, null),
    ('I282702581169', 'nascita', null, '1966', '1966-01-01', 'anno', null, null),
    ('I282702581169', 'morte', null, '1966', '1966-01-01', 'anno', null, null),
    ('I282721486742', 'nascita', null, '23 Agosto 2025', '2025-08-23', 'giorno', null, null)
  ) as t(rif, tipo, titolo, dt, di, prec, lid, lt)
  join gen_persone p on p.user_id = v and p.rif_gedcom = t.rif
  left join gen_luoghi l on l.user_id = v and l.nome = t.lid;
end
$import$;
