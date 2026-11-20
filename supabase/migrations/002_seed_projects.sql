insert into public.projects
  (slug, title, description, category, location, featured, sort_order, status)
values
  ('liberty-market-beautification', 'Liberty Market Beautification',
   'Facade refurbishment, signage discipline and public-realm upgrades for one of Lahore''s best-known commercial streets.',
   'Urban & public', 'Lahore, Punjab', true, 10, 'published'),
  ('dinga-city-gateway', 'Dinga City Gateway',
   'A civic gateway monument marking the entrance to the city — structure, finishes and lighting drawn for construction.',
   'Urban & public', 'Dinga, Punjab', true, 20, 'published'),
  ('municipal-corporation-works', 'Municipal Corporation Works',
   'Concept and working drawings for civic buildings and municipal infrastructure, prepared to authority standards.',
   'Urban & public', 'Dera Ghazi Khan, Punjab', true, 30, 'published'),
  ('wellness-rehabilitation-centre', 'Wellness & Rehabilitation Centre',
   'Planning and interiors for a wellness facility — therapy spaces, patient circulation and calm, durable materials.',
   'Healthcare', 'Punjab', true, 40, 'published'),
  ('padel-court-complex', 'Padel Court Complex',
   'Padel courts and clubhouse facilities — structure, glazing, lighting and spectator areas from one drawing set.',
   'Sports', 'Lahore, Punjab', true, 50, 'published'),
  ('private-residences-facades', 'Private Residences & Façades',
   'Homes designed and documented end to end — plans, elevations, working drawings and site supervision.',
   'Residential', 'Lahore · Burewala · Punjab', true, 60, 'published'),
  ('luxury-residential-interiors', 'Luxury Residential Interiors',
   'Interior design and joinery detailing for private homes — marble, panelling and lighting coordinated room by room.',
   'Interiors', 'Lahore, Punjab', false, 70, 'published'),
  ('fountains-street-furniture', 'Fountains & Street Furniture',
   'Fountain design, monument detailing and kerb BOQs for municipal streetscape projects.',
   'Urban & public', 'Various cities', false, 80, 'published')
on conflict (slug) do nothing;
