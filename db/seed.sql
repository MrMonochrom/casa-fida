-- Sample data for trying Casa Fida locally. Every account's password is CasaFida123.
-- Dates are relative to when this runs, so the data always looks recent.
USE casa_fida;

SET @pw = 'scrypt$5174647e2f5d44f576c4f99b1329ebf5$8e07b38709b283ac3d2ea80d993619263a07094d12078673b65c2b63f236cf4c3549e7edf8e3d9539c235138262141b2caa9abe43a2ab23982b4c6634c314c4d';

-- ---------- People ----------

INSERT INTO users (id, email, password_hash, name, role, phone, created_at) VALUES
  (1, 'marcus.reid@example.com', @pw, 'Marcus Reid', 'builder', '(303) 555-0141', NOW() - INTERVAL 800 DAY),
  (2, 'priya.shah@example.com', @pw, 'Priya Shah', 'builder', '(303) 555-0172', NOW() - INTERVAL 500 DAY),
  (3, 'tom.becker@example.com', @pw, 'Tom Becker', 'builder', '(720) 555-0118', NOW() - INTERVAL 420 DAY),
  (4, 'lena.ortiz@example.com', @pw, 'Lena Ortiz', 'builder', NULL, NOW() - INTERVAL 300 DAY),
  (5, 'sam.whitfield@example.com', @pw, 'Sam Whitfield', 'builder', '(303) 555-0190', NOW() - INTERVAL 250 DAY),
  (6, 'grace.kim@example.com', @pw, 'Grace Kim', 'builder', NULL, NOW() - INTERVAL 40 DAY),
  (7, 'emma.clarke@example.com', @pw, 'Emma Clarke', 'client', '(303) 555-0123', NOW() - INTERVAL 200 DAY),
  (8, 'david.nguyen@example.com', @pw, 'David Nguyen', 'client', NULL, NOW() - INTERVAL 280 DAY),
  (9, 'olivia.brooks@example.com', @pw, 'Olivia Brooks', 'client', NULL, NOW() - INTERVAL 450 DAY),
  (10, 'noah.patel@example.com', @pw, 'Noah Patel', 'client', NULL, NOW() - INTERVAL 5 DAY);

-- The sample accounts have confirmed their email addresses.
UPDATE users SET email_verified_at = created_at;

INSERT INTO builder_profiles
  (user_id, business_name, headline, about, service_area, years_in_business, license_number, insured) VALUES
  (1, 'Reid & Sons Construction', 'Family-run general contractor for new homes, additions and whole-home remodels.',
   'We''re a second-generation builder with a crew of twelve. Every project gets one project manager from the first visit to the final walkthrough, and weekly photo updates so you always know where things stand.\n\nWe handle permits, design coordination and inspections.',
   'Denver, CO', 18, 'GC-48213', TRUE),
  (2, 'Shah Kitchen & Bath', 'Kitchens and bathrooms, designed and built by one team.',
   'Design and build under one roof: we draw up the plans, help you pick materials, and our own installers do the work. Fixed prices with clear allowances, so there are no surprises.',
   'Boulder, CO', 9, 'CO-KB-2291', TRUE),
  (3, 'Becker Roofing', 'Roof replacements, repairs and skylights. Free inspections.',
   'Asphalt, metal and tile roofs. Most replacements take two to three days. We photograph the roof deck before covering it, so you can see what was fixed.',
   'Aurora, CO', 22, 'RC-77310', TRUE),
  (4, 'Ortiz Outdoor Living', 'Decks, patios, pergolas and backyard makeovers.',
   'Composite and cedar decks, pergolas, fences and patios. We build what we design and stand behind it with a five-year workmanship warranty.',
   'Lakewood, CO', 6, NULL, TRUE),
  (5, 'Whitfield Electric', 'Licensed electricians for remodels, panel upgrades and EV chargers.',
   'Residential electrical work of every size, from a single circuit to a full rewire. We pull every permit and book the inspection for you.',
   'Denver, CO', 12, 'EC-10584', TRUE),
  (6, 'Kim Renovation Co.', 'Small renovations done carefully: basements, painting and repairs.',
   'A small team that takes on fewer jobs and finishes them properly. Basement finishing, interior and exterior painting, drywall and trim.',
   'Littleton, CO', 4, NULL, FALSE);

INSERT INTO builder_trades (user_id, trade) VALUES
  (1, 'new_homes'), (1, 'extensions'), (1, 'renovations'),
  (2, 'kitchens'), (2, 'bathrooms'), (2, 'flooring'),
  (3, 'roofing'), (3, 'windows_doors'),
  (4, 'decks_landscaping'), (4, 'carpentry'),
  (5, 'electrical'),
  (6, 'renovations'), (6, 'painting'), (6, 'basements_attics');

-- ---------- Jobs and quotes ----------

INSERT INTO jobs (id, client_id, title, description, trade, location, budget_min, budget_max, timing, status, created_at) VALUES
  (1, 7, 'Rear extension & open-plan kitchen',
   'We''d like a single-story rear extension (about 400 sq ft) that opens the kitchen into a family room, with big windows onto the garden.',
   'extensions', 'Denver, CO', 12000000, 16000000, 'within_3_months', 'hired', NOW() - INTERVAL 100 DAY),
  (2, 7, 'Main bathroom remodel',
   'Full remodel of our main bathroom (about 8 × 10 ft). Walk-in shower instead of the tub, new vanity and tile. Happy to hear ideas about heated floors.',
   'bathrooms', 'Denver, CO', 1800000, 2500000, 'within_3_months', 'open', NOW() - INTERVAL 6 DAY),
  (3, 8, 'Backyard deck with pergola',
   'Replace our old wooden deck with a composite one, about 16 × 20 ft, with a pergola over part of it for shade.',
   'decks_landscaping', 'Aurora, CO', 1500000, 2200000, 'within_6_months', 'open', NOW() - INTERVAL 9 DAY),
  (4, 10, 'Finish the basement',
   'Unfinished basement, about 900 sq ft. We''d like a family room, a guest bedroom and a small bathroom. The rough-in plumbing is already there.',
   'basements_attics', 'Littleton, CO', 3000000, 4500000, 'flexible', 'open', NOW() - INTERVAL 2 DAY),
  (5, 7, 'Replace the roof',
   'Our asphalt roof is 25 years old and leaking over the garage. Looking for a full replacement.',
   'roofing', 'Denver, CO', 1800000, 2500000, 'asap', 'hired', NOW() - INTERVAL 150 DAY),
  (6, 10, 'Repaint the outside of the house',
   'Two-story house with wood siding. Needs scraping, priming and two coats. Trim in a contrasting color.',
   'painting', 'Littleton, CO', NULL, 1200000, 'within_3_months', 'open', NOW() - INTERVAL 1 DAY);

INSERT INTO quotes (id, job_id, builder_id, amount, weeks, message, status, created_at) VALUES
  (1, 1, 1, 14850000, 10,
   'Price covers design drawings, permits, foundation, framing, roofing tie-in, windows, electrical, plumbing and finishes to the spec we discussed. Kitchen cabinets are an allowance of $18,000.',
   'accepted', NOW() - INTERVAL 95 DAY),
  (2, 2, 2, 2240000, 5,
   'Includes a curbless walk-in shower, heated floors and a double vanity. Covers demolition, plumbing changes, tile and fixtures (fixture allowance $4,000).',
   'pending', NOW() - INTERVAL 4 DAY),
  (3, 2, 6, 1790000, 6,
   'A straightforward remodel that keeps the current layout: walk-in shower, new vanity, toilet, floor and wall tile, and paint.',
   'pending', NOW() - INTERVAL 3 DAY),
  (4, 3, 4, 1875000, 4,
   'Pressure-treated frame with composite decking and a 12 × 12 ft cedar pergola. The permit and removal of the old deck are included.',
   'pending', NOW() - INTERVAL 7 DAY),
  (5, 5, 3, 2160000, 1,
   'Full tear-off, new underlayment and architectural shingles, plus new flashing around the chimney. Any rotten decking is replaced at $85 a sheet.',
   'accepted', NOW() - INTERVAL 148 DAY);

-- The quotes haven't been changed since they were sent.
UPDATE quotes SET updated_at = created_at;

-- ---------- Projects ----------

INSERT INTO projects
  (id, builder_id, client_id, client_name, client_email, title, description, address, contract_amount, start_date,
   status, job_id, created_at, accepted_at, completed_at) VALUES
  (1, 1, 7, 'Emma Clarke', 'emma.clarke@example.com', 'Rear extension & open-plan kitchen',
   'Single-story rear extension of about 400 sq ft, opening the kitchen into a new family room with large garden windows.',
   '1420 Elm Street, Denver, CO', 14850000, CURDATE() - INTERVAL 63 DAY,
   'active', 1, NOW() - INTERVAL 90 DAY, NOW() - INTERVAL 90 DAY, NULL),
  (2, 2, 8, 'David Nguyen', 'david.nguyen@example.com', 'Kitchen remodel',
   'New cabinets, quartz counters and an island with seating. Move the sink under the window and add a gas range. Price includes a $9,000 allowance for appliances.',
   '88 Willow Court, Aurora, CO', 4680000, CURDATE() + INTERVAL 21 DAY,
   'proposed', NULL, NOW() - INTERVAL 1 DAY, NULL, NULL),
  (3, 3, 7, 'Emma Clarke', 'emma.clarke@example.com', 'Replace the roof',
   'Full tear-off and replacement with architectural shingles and new chimney flashing.',
   '1420 Elm Street, Denver, CO', 2160000, CURDATE() - INTERVAL 140 DAY,
   'completed', 5, NOW() - INTERVAL 145 DAY, NOW() - INTERVAL 145 DAY, NOW() - INTERVAL 130 DAY),
  (4, 1, 9, 'Olivia Brooks', 'olivia.brooks@example.com', 'Two-story addition',
   'Two-story addition with a primary suite upstairs and a mudroom and office downstairs.',
   '5 Aspen Lane, Denver, CO', 21200000, CURDATE() - INTERVAL 420 DAY,
   'completed', NULL, NOW() - INTERVAL 430 DAY, NOW() - INTERVAL 428 DAY, NOW() - INTERVAL 330 DAY),
  (5, 2, 9, 'Olivia Brooks', 'olivia.brooks@example.com', 'Guest bathroom refresh',
   'New tile, vanity and lighting in the guest bathroom.',
   '5 Aspen Lane, Denver, CO', 1420000, CURDATE() - INTERVAL 200 DAY,
   'completed', NULL, NOW() - INTERVAL 210 DAY, NOW() - INTERVAL 209 DAY, NOW() - INTERVAL 180 DAY),
  (6, 4, 9, 'Olivia Brooks', 'olivia.brooks@example.com', 'Cedar deck rebuild',
   'Rebuild of the back deck in cedar, with new stairs and railings.',
   '5 Aspen Lane, Denver, CO', 1690000, CURDATE() - INTERVAL 110 DAY,
   'completed', NULL, NOW() - INTERVAL 120 DAY, NOW() - INTERVAL 118 DAY, NOW() - INTERVAL 95 DAY),
  (7, 1, 8, 'David Nguyen', 'david.nguyen@example.com', 'Garage conversion',
   'Convert the attached garage into a home office with a half bathroom.',
   '88 Willow Court, Aurora, CO', 5800000, CURDATE() - INTERVAL 260 DAY,
   'completed', NULL, NOW() - INTERVAL 270 DAY, NOW() - INTERVAL 268 DAY, NOW() - INTERVAL 230 DAY),
  (8, 5, 7, 'Emma Clarke', 'emma.clarke@example.com', 'Panel upgrade & EV charger',
   'Upgrade the main panel to 200 A and install a Level 2 EV charger in the garage.',
   '1420 Elm Street, Denver, CO', 485000, CURDATE() - INTERVAL 65 DAY,
   'completed', NULL, NOW() - INTERVAL 70 DAY, NOW() - INTERVAL 69 DAY, NOW() - INTERVAL 62 DAY);

INSERT INTO stages (id, project_id, name, position, status) VALUES
  (1, 1, 'Permits & design', 0, 'done'),
  (2, 1, 'Foundation', 1, 'done'),
  (3, 1, 'Framing', 2, 'in_progress'),
  (4, 1, 'Roofing', 3, 'todo'),
  (5, 1, 'Plumbing & electrical', 4, 'todo'),
  (6, 1, 'Insulation & drywall', 5, 'todo'),
  (7, 1, 'Painting & finishes', 6, 'todo'),
  (8, 1, 'Final inspection', 7, 'todo'),
  (9, 2, 'Demolition', 0, 'todo'),
  (10, 2, 'Plumbing & electrical', 1, 'todo'),
  (11, 2, 'Cabinets & counters', 2, 'todo'),
  (12, 2, 'Painting & finishes', 3, 'todo'),
  (13, 3, 'Tear-off & inspection', 0, 'done'),
  (14, 3, 'New roof', 1, 'done'),
  (15, 4, 'Foundation', 0, 'done'),
  (16, 4, 'Framing', 1, 'done'),
  (17, 4, 'Painting & finishes', 2, 'done'),
  (18, 5, 'Demolition', 0, 'done'),
  (19, 5, 'Tiling & fixtures', 1, 'done'),
  (20, 6, 'Demolition', 0, 'done'),
  (21, 6, 'New deck', 1, 'done'),
  (22, 7, 'Framing & insulation', 0, 'done'),
  (23, 7, 'Painting & finishes', 1, 'done'),
  (24, 8, 'Panel upgrade', 0, 'done'),
  (25, 8, 'EV charger', 1, 'done');

INSERT INTO updates (project_id, author_id, stage_id, body, created_at) VALUES
  (1, 1, 1, 'Permits are approved and the site is fenced off. The dumpster arrives Monday morning, so please keep the driveway clear.', NOW() - INTERVAL 62 DAY),
  (1, 1, 2, 'Footings poured and passed inspection this morning. The concrete needs about a week to cure before we start framing.', NOW() - INTERVAL 45 DAY),
  (1, 1, 3, 'The walls are up on the extension! Next week we tie the new roofline into the existing house.', NOW() - INTERVAL 18 DAY),
  (1, 1, 3, 'Roof trusses delivered and set. We found some rot in the old header over the kitchen door and replaced it while the wall was open, at no extra charge.', NOW() - INTERVAL 2 DAY),
  (3, 3, 14, 'All done. Photos of the new flashing are in your inbox, and the old shingles have been hauled away.', NOW() - INTERVAL 130 DAY);

INSERT INTO change_orders (project_id, title, description, amount, days, status, created_at, decided_at) VALUES
  (1, 'Upgrade to triple-pane windows',
   'Swap the four garden windows for triple-pane units: quieter and warmer in winter.',
   320000, 2, 'approved', NOW() - INTERVAL 40 DAY, NOW() - INTERVAL 39 DAY),
  (1, 'Add a skylight over the kitchen',
   'A 2 × 4 ft venting skylight centered over the new island, with a rain sensor. Easiest to add now, before the roof is closed in.',
   285000, 3, 'pending', NOW() - INTERVAL 1 DAY, NULL),
  (4, 'Heated bathroom floor', 'Electric radiant heat under the primary bathroom tile.', 210000, 1, 'approved',
   NOW() - INTERVAL 400 DAY, NOW() - INTERVAL 399 DAY);

INSERT INTO invoices (project_id, number, title, amount, due_date, status, created_at, paid_at) VALUES
  (1, 1, 'Deposit (10%)', 1485000, CURDATE() - INTERVAL 85 DAY, 'paid', NOW() - INTERVAL 90 DAY, NOW() - INTERVAL 86 DAY),
  (1, 2, 'Foundation complete', 2970000, CURDATE() - INTERVAL 38 DAY, 'paid', NOW() - INTERVAL 44 DAY, NOW() - INTERVAL 40 DAY),
  (1, 3, 'Framing complete', 2970000, CURDATE() + INTERVAL 7 DAY, 'due', NOW() - INTERVAL 1 DAY, NULL),
  (3, 1, 'Roof replacement', 2160000, CURDATE() - INTERVAL 120 DAY, 'paid', NOW() - INTERVAL 130 DAY, NOW() - INTERVAL 125 DAY),
  (4, 1, 'Deposit', 4240000, CURDATE() - INTERVAL 420 DAY, 'paid', NOW() - INTERVAL 428 DAY, NOW() - INTERVAL 421 DAY),
  (4, 2, 'Framing complete', 8480000, CURDATE() - INTERVAL 370 DAY, 'paid', NOW() - INTERVAL 380 DAY, NOW() - INTERVAL 372 DAY),
  (4, 3, 'Final payment', 8690000, CURDATE() - INTERVAL 320 DAY, 'paid', NOW() - INTERVAL 330 DAY, NOW() - INTERVAL 322 DAY),
  (5, 1, 'Guest bathroom', 1420000, CURDATE() - INTERVAL 170 DAY, 'paid', NOW() - INTERVAL 180 DAY, NOW() - INTERVAL 175 DAY),
  (6, 1, 'Deck rebuild', 1690000, CURDATE() - INTERVAL 85 DAY, 'paid', NOW() - INTERVAL 95 DAY, NOW() - INTERVAL 90 DAY),
  (7, 1, 'Deposit', 1740000, CURDATE() - INTERVAL 265 DAY, 'paid', NOW() - INTERVAL 268 DAY, NOW() - INTERVAL 266 DAY),
  (7, 2, 'Final payment', 4060000, CURDATE() - INTERVAL 220 DAY, 'paid', NOW() - INTERVAL 230 DAY, NOW() - INTERVAL 224 DAY),
  (8, 1, 'Panel upgrade & EV charger', 485000, CURDATE() - INTERVAL 50 DAY, 'paid', NOW() - INTERVAL 62 DAY, NOW() - INTERVAL 55 DAY);

INSERT INTO reviews (project_id, builder_id, client_id, rating, body, created_at) VALUES
  (3, 3, 7, 5, 'Tom''s crew replaced our whole roof in three days and left the yard cleaner than they found it. Clear quote and no surprises.', NOW() - INTERVAL 128 DAY),
  (4, 1, 9, 4, 'Great quality and communication. The schedule slipped about two weeks because of permits, but Marcus kept us updated every step of the way.', NOW() - INTERVAL 325 DAY),
  (5, 2, 9, 5, 'Priya has a fantastic eye for design. Our guest bathroom looks like a hotel now.', NOW() - INTERVAL 178 DAY),
  (6, 4, 9, 4, 'Solid deck at a fair price. It finished a few days late because of rain, which we understood.', NOW() - INTERVAL 92 DAY),
  (7, 1, 8, 5, 'They turned our garage into a beautiful home office. The weekly photo updates meant we always knew where things stood.', NOW() - INTERVAL 228 DAY),
  (8, 5, 7, 5, 'Quick, tidy, and Sam explained everything. The EV charger works perfectly.', NOW() - INTERVAL 60 DAY);

-- ---------- Messages ----------

INSERT INTO conversations (id, client_id, builder_id, created_at) VALUES
  (1, 7, 1, NOW() - INTERVAL 99 DAY),
  (2, 7, 2, NOW() - INTERVAL 4 DAY),
  (3, 8, 2, NOW() - INTERVAL 5 DAY),
  (4, 8, 4, NOW() - INTERVAL 6 DAY),
  (5, 7, 3, NOW() - INTERVAL 149 DAY),
  (6, 9, 1, NOW() - INTERVAL 431 DAY);

INSERT INTO messages (conversation_id, sender_id, body, sent_at, read_at) VALUES
  (1, 7, 'Hi Marcus, we loved your quote. Could you come by to measure for the windows?', NOW() - INTERVAL 96 DAY, NOW() - INTERVAL 96 DAY),
  (1, 1, 'Of course. Would Thursday at 9 work?', NOW() - INTERVAL 96 DAY, NOW() - INTERVAL 96 DAY),
  (1, 7, 'Thursday is perfect, thank you!', NOW() - INTERVAL 95 DAY, NOW() - INTERVAL 95 DAY),
  (1, 7, 'The framing looks amazing. Is there still time to add a skylight over the island?', NOW() - INTERVAL 3 DAY, NOW() - INTERVAL 3 DAY),
  (1, 1, 'There is, as long as we do it before the roof is closed in next week. I''ve sent you a change order with the price.', NOW() - INTERVAL 1 DAY, NULL),
  (2, 7, 'Hi Priya, thanks for the quote. Is the heated floor included in the price?', NOW() - INTERVAL 3 DAY, NOW() - INTERVAL 3 DAY),
  (2, 2, 'Yes, it is: the price covers the mat, the thermostat and the wiring to it.', NOW() - INTERVAL 3 DAY, NOW() - INTERVAL 2 DAY),
  (3, 8, 'Hi, we''re looking to redo our kitchen. Would you be able to take a look?', NOW() - INTERVAL 5 DAY, NOW() - INTERVAL 5 DAY),
  (3, 2, 'Happy to! I can stop by Saturday morning.', NOW() - INTERVAL 5 DAY, NOW() - INTERVAL 5 DAY),
  (3, 2, 'Great to meet you both on Saturday. I''ve sent the proposal through Casa Fida, so you can accept it there.', NOW() - INTERVAL 1 DAY, NULL),
  (4, 4, 'Thanks for posting your deck job! Do you know if the current footings are in good shape?', NOW() - INTERVAL 6 DAY, NOW() - INTERVAL 6 DAY),
  (4, 8, 'Not sure, they''re about 20 years old.', NOW() - INTERVAL 6 DAY, NOW() - INTERVAL 6 DAY),
  (4, 4, 'No problem, I''ve included new footings in my quote to be safe.', NOW() - INTERVAL 5 DAY, NOW() - INTERVAL 5 DAY),
  (5, 3, 'Your new roof is done! Thanks for choosing us.', NOW() - INTERVAL 130 DAY, NOW() - INTERVAL 130 DAY),
  (6, 9, 'Thanks again for the addition. We love it.', NOW() - INTERVAL 330 DAY, NOW() - INTERVAL 330 DAY);
