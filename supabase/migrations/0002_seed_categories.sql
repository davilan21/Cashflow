-- Categorías por defecto, inspiradas en los billetes colombianos.
insert into categories (id, nombre, color, orden, user_id) values
  ('mercado',        'Mercado',                     '#2A7A86', 1, null),
  ('restaurantes',   'Restaurantes y domicilios',    '#C4544F', 2, null),
  ('transporte',     'Transporte',                   '#6B4E9E', 3, null),
  ('vivienda',       'Vivienda y servicios',         '#3B5C8F', 4, null),
  ('salud',          'Salud',                        '#4E8C5A', 5, null),
  ('ocio',           'Ocio',                         '#C08A2E', 6, null),
  ('compras',        'Compras',                      '#A8557E', 7, null),
  ('suscripciones',  'Suscripciones',                '#7A6A55', 8, null),
  ('otros',          'Otros',                        '#6B6F76', 9, null)
on conflict (id) do nothing;
