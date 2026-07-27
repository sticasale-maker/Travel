/* enrichdata.js — per-day content for the enrichment layer (enrich.js).
   Keyed by data-date. Attractions, top-reviewed food, opening hours, average
   prices and mobile coverage gathered from current web sources (Google/
   Tripadvisor/official sites); photos are freely-licensed Wikimedia images.
   HOURS & PRICES CHANGE — treat as a guide and confirm, especially remote spots.
   todo:  { id, cat, name, en, it, dur, q, hours }
   food:  { kind, name, rating, en, it, q, hours, avg, where? }
   coverage: { telstra:'good|patchy|none', optus:'...', note }  (Marco=Telstra, Giulia&Vittoria=Optus)
   Load BEFORE enrich.js. */
window.TRIP_ENRICH = {

  // ---- Day 1 · Fri 31 Jul · Dubbo ----------------------------------------
  '2026-07-31': {
    photo: { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/df/2020-10-08_Taronga_Western_Plains_Zoo.jpg/960px-2020-10-08_Taronga_Western_Plains_Zoo.jpg', credit: 'Maksym Kozlenko', license: 'CC BY-SA 4.0', alt: 'Taronga Western Plains Zoo, Dubbo' },
    coverage: { telstra: 'good', optus: 'good', note: 'Both strong all the way from Sydney via Bathurst/Orange.' },
    todo: [
      { id: 'zoo-safari', cat: 'wildlife', name: 'Taronga Western Plains Zoo safari', en: 'Dawn drive-through past open-range African animals.', it: 'Safari all’alba tra animali africani in libertà.', dur: '2–3 h', q: 'Taronga Western Plains Zoo Dubbo', hours: 'Daily 9:00–16:00' },
      { id: 'old-gaol', cat: 'heritage', name: 'Old Dubbo Gaol', en: '1847 gaol — gallows, solitary cells, night tours.', it: 'Prigione del 1847 — forca, celle, tour serali.', dur: '1–2 h', q: 'Old Dubbo Gaol', hours: 'Daily 9:00–17:00' },
      { id: 'observatory', cat: 'star', name: 'Dubbo Observatory', en: 'Evening stargazing through big telescopes.', it: 'Osservazione delle stelle coi telescopi, di sera.', dur: '1.5–2 h', q: 'Dubbo Observatory', hours: 'By booking (evenings)' },
      { id: 'wellington-caves', cat: 'walk', name: 'Wellington Caves', en: 'Limestone caves & fossils, 45 min south.', it: 'Grotte calcaree e fossili, 45 min a sud.', dur: '1.5–2 h', q: 'Wellington Caves NSW', hours: 'Daily 9:00–16:15 (tours)' },
      { id: 'jp-gardens', cat: 'garden', name: 'Osawano Japanese Gardens', en: 'Free, tranquil gardens by the caves.', it: 'Giardini giapponesi gratuiti, vicino alle grotte.', dur: '30–45 min', q: 'Japanese Gardens Wellington NSW', hours: 'Daily 10:00–18:00' }
    ],
    food: [
      { kind: 'restaurant', name: 'Royal India Restobar', rating: '4.7', en: 'Stylish Indian, generous portions.', it: 'Indiano elegante, porzioni abbondanti.', q: 'Royal India Restobar Dubbo', hours: 'Daily 17:00–21:00', avg: 'mains ~$22' },
      { kind: 'cafe', name: 'Grapevine Cafe', rating: '4.5', en: 'Heritage cafe, famed banana bread.', it: 'Caffè storico, banana bread famoso.', q: 'Grapevine Cafe Dubbo', hours: 'Mon–Fri 7:00–15:00; Sat–Sun 8:00–14:00', avg: 'brunch ~$26' },
      { kind: 'restaurant', name: 'Old Bank Restaurant & Bar', rating: '4.4', en: '1870s building, craft beer, steaks.', it: 'Edificio del 1870, birre artigianali, bistecche.', q: 'Old Bank Restaurant and Bar Dubbo', hours: 'Tue–Sat 12:00–14:30, 18:00–21:00', avg: 'mains $28–38' },
      { kind: 'cafe', name: 'The Lithgow Tin Shed', rating: '4.5', en: 'Rustic cafe, homemade pies.', it: 'Caffè rustico, torte salate fatte in casa.', q: 'The Lithgow Tin Shed', where: 'Lithgow', hours: 'Mon–Fri 6:30–15:00; Sat 8:00–14:30; Sun 8:00–15:00', avg: 'mains ~$25' },
      { kind: 'cafe', name: 'The Hub', rating: '4.6', en: 'Open-fire cafe, great brunch.', it: 'Caffè col camino, ottimo brunch.', q: 'The Hub Bathurst', where: 'Bathurst', hours: 'Mon, Wed–Sat 7:00–15:00; Sun 8:00–14:00', avg: 'brunch ~$22' },
      { kind: 'cafe', name: 'Crema on Lords', rating: '4.8', en: 'Top coffee, free piccolo while you wait.', it: 'Caffè top, piccolo gratis nell’attesa.', q: 'Crema on Lords Orange NSW', where: 'Orange', hours: 'Mon–Fri 5:00–13:00; Sat–Sun 6:00–13:00', avg: 'brunch ~$20' }
    ]
  },

  // ---- Day 2 · Sat 1 Aug · Cobar -----------------------------------------
  '2026-08-01': {
    photo: { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d5/Aerial_view_of_Cobar%2CNew_South_Wales%2C_2009-03-06.jpg/960px-Aerial_view_of_Cobar%2CNew_South_Wales%2C_2009-03-06.jpg', credit: 'Andy', license: 'CC BY-SA 2.0', alt: 'Cobar, NSW from the air' },
    coverage: { telstra: 'good', optus: 'patchy', note: 'Telstra reliable in town; Optus weaker and drops outside the centre.' },
    todo: [
      { id: 'heritage-centre', cat: 'heritage', name: 'Great Cobar Heritage Centre', en: '1912 mine HQ, copper-mining history.', it: 'Sede mineraria del 1912, storia del rame.', dur: '1–1.5 h', q: 'Great Cobar Heritage Centre', hours: 'Mon–Fri 8:30–17:00; Sat–Sun 9:00–17:00' },
      { id: 'miners-park', cat: 'mine', name: 'Cobar Miners Heritage Park', en: 'Outdoor mining relics and memorial.', it: 'Cimeli minerari e memoriale all’aperto.', dur: '30–45 min', q: 'Cobar Miners Heritage Park', hours: '24/7' },
      { id: 'fort-bourke', cat: 'lookout', name: 'Fort Bourke Hill Lookout', en: 'Views over town and an open-cut mine.', it: 'Vista sul paese e sulla miniera a cielo aperto.', dur: '30 min', q: 'Fort Bourke Hill Lookout Cobar', hours: '24/7' },
      { id: 'heritage-walk', cat: 'walk', name: 'Cobar Heritage Walk', en: 'Self-guided walk past mining-era sites.', it: 'Passeggiata tra i siti dell’epoca mineraria.', dur: '1 h', q: 'Cobar Heritage Walk', hours: '24/7' }
    ],
    food: [
      { kind: 'cafe', name: 'Ay-Jays Cafe', rating: '4.4', en: 'Friendly; steak sandwiches, milkshakes.', it: 'Accogliente; panini con bistecca, frappè.', q: 'Ay-Jays Cafe Cobar', hours: 'Daily 4:00–14:00; Mon–Sat 17:30–20:00', avg: 'brunch ~$20' },
      { kind: 'pub', name: 'Great Western Hotel', rating: '4.0', en: '1898 pub, long iron-lace veranda, hearty meals.', it: 'Pub del 1898, veranda in ferro, piatti sostanziosi.', q: 'Great Western Hotel Motel Cobar', hours: 'Daily 10:00–late (meals 12:00–14:00, 18:00–21:00)', avg: 'mains ~$28' },
      { kind: 'cafe', name: 'The Bogan Coffee Shop', rating: '4.6', en: 'Best coffee since Sydney, fresh pies.', it: 'Miglior caffè da Sydney, torte fresche.', q: 'Bogan Coffee Shop Nyngan', where: 'Nyngan', hours: 'Mon–Fri 6:00–14:30; Sat 8:00–14:00', avg: 'light meals ~$14' },
      { kind: 'cafe', name: "Mart's Cafe", rating: '4.6', en: 'Local favourite: burgers, coffee, opens early.', it: 'Preferito dai locali: burger, caffè, apre presto.', q: "Mart's Cafe Nyngan", where: 'Nyngan', hours: 'Mon–Fri 5:30–16:00; Sat 7:00–14:00', avg: 'mains ~$16' }
    ]
  },

  // ---- Day 3 · Sun 2 Aug · Broken Hill -----------------------------------
  '2026-08-02': {
    photo: { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/db/Broken_Hill_Town_%26_Line_of_Lode_Pano%2C_NSW%2C_08.07.2007.jpg/960px-Broken_Hill_Town_%26_Line_of_Lode_Pano%2C_NSW%2C_08.07.2007.jpg', credit: "Jjron (John O'Neill)", license: 'CC BY-SA 3.0', alt: 'Broken Hill and the Line of Lode' },
    coverage: { telstra: 'good', optus: 'patchy', note: 'Both work in town, Optus less reliable. The Barrier Hwy in has long dead gaps.' },
    todo: [
      { id: 'living-desert', cat: 'art', name: 'Living Desert Sculptures', en: '12 hilltop sandstone artworks, best at sunset.', it: '12 sculture in arenaria su collina, top al tramonto.', dur: '1–1.5 h', q: 'Living Desert Sculptures Broken Hill', hours: 'Daily 8:30–sunset' },
      { id: 'line-of-lode', cat: 'lookout', name: 'Line of Lode Miners Memorial', en: 'Hilltop memorial and lookout over town.', it: 'Memoriale e belvedere sulla città.', dur: '45 min–1 h', q: 'Line of Lode Miners Memorial Broken Hill', hours: 'Daily 8:00–22:00' },
      { id: 'geocentre', cat: 'heritage', name: 'GeoCentre (Minerals Museum)', en: 'Free museum; a 42 kg silver nugget.', it: 'Museo gratuito; pepita d’argento da 42 kg.', dur: '1–1.5 h', q: 'GeoCentre Broken Hill', hours: 'Tue–Sat 10:00–16:00' },
      { id: 'palace-hotel', cat: 'star', name: 'Palace Hotel', en: '1889 pub with Priscilla murals.', it: 'Pub del 1889 coi murales di Priscilla.', dur: '30–45 min', q: 'Palace Hotel Broken Hill', hours: 'Daily 12:00–late' },
      { id: 'rfds', cat: 'heritage', name: 'Royal Flying Doctor Service', en: 'Interactive outback flying-doctor exhibit.', it: 'Mostra interattiva sui medici volanti.', dur: '1 h', q: 'Royal Flying Doctor Service Visitor Centre Broken Hill', hours: 'Mon–Fri 9:00–17:00; Sat–Sun 10:00–15:00' }
    ],
    food: [
      { kind: 'restaurant', name: 'The Old Salt Bush', rating: '4.9', en: 'Award-winning modern Australian — book ahead.', it: 'Cucina australiana moderna premiata — prenotare.', q: 'The Old Salt Bush Restaurant Broken Hill', hours: 'Thu–Sat 18:00–22:00', avg: 'mains ~$42' },
      { kind: 'cafe', name: 'The Silly Goat', rating: '4.5', en: 'Melbourne-grade coffee, creative brunch.', it: 'Caffè da Melbourne, brunch creativo.', q: 'The Silly Goat Broken Hill', hours: 'Daily 7:00–15:00', avg: 'brunch ~$20' },
      { kind: 'cafe', name: "Alfresco's Cafe", rating: '4.2', en: 'Lively all-day breakfast, big serves.', it: 'Colazione tutto il giorno, porzioni grandi.', q: "Alfresco's Cafe Broken Hill", hours: 'Daily 7:00–22:30', avg: 'brunch ~$22' },
      { kind: 'roadhouse', name: 'Emmdale Roadhouse', rating: '', en: 'Bacon-egg rolls, burgers, shakes.', it: 'Panini, burger, frappè.', q: 'Emmdale Roadhouse Wilcannia', where: 'Emmdale', hours: 'Daily 7:00–20:00', avg: 'counter meals ~$12' }
    ]
  },

  // ---- Day 4 · Mon 3 Aug · Silverton (day trip) --------------------------
  '2026-08-03': {
    photo: { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/19/SilvertonCrossroads.JPG/960px-SilvertonCrossroads.JPG', credit: 'Mattinbgn', license: 'CC BY-SA 3.0', alt: 'Silverton, NSW' },
    coverage: { telstra: 'patchy', optus: 'none', note: 'Weak Telstra only; Optus essentially unavailable out here.' },
    todo: [
      { id: 'mundi-mundi', cat: 'lookout', name: 'Mundi Mundi Lookout', en: 'Vast plains; you can see the earth curve.', it: 'Pianura sconfinata; si vede la curvatura terrestre.', dur: '30–45 min', q: 'Mundi Mundi Lookout Silverton', hours: '24/7' },
      { id: 'madmax', cat: 'star', name: 'Mad Max 2 Museum', en: 'Costumes, cars and memorabilia from filming.', it: 'Costumi, auto e cimeli del film.', dur: '45 min–1 h', q: 'Mad Max 2 Museum Silverton', hours: 'Daily 10:00–16:00' },
      { id: 'silverton-hotel', cat: 'star', name: 'Silverton Hotel', en: '1880s pub full of Mad Max photos.', it: 'Pub del 1880 pieno di foto di Mad Max.', dur: '30–45 min', q: 'Silverton Hotel Silverton NSW', hours: 'Mon 9:00–20:00; Tue–Sat 8:00–23:00; Sun 10:00–22:00' },
      { id: 'gaol-museum', cat: 'heritage', name: 'Silverton Gaol Museum', en: 'Small 1889 gaol, local history.', it: 'Piccola prigione del 1889, storia locale.', dur: '30 min', q: 'Silverton Gaol Museum', hours: 'Daily 9:30–16:00' },
      { id: 'daydream-mine', cat: 'mine', name: 'Daydream Mine tour', en: 'Guided 1880s underground silver workings.', it: 'Visita guidata alla miniera d’argento del 1880.', dur: '1–1.5 h', q: 'Daydream Mine Silverton', hours: 'Tours 10:00, 11:30' }
    ],
    food: [
      { kind: 'pub', name: 'Silverton Hotel', rating: '4.2', en: 'Iconic outback pub, Mad Max car out front.', it: 'Pub iconico, auto di Mad Max all’ingresso.', q: 'Silverton Hotel Silverton NSW', hours: 'Tue–Sat 8:00–23:00; Sun–Mon shorter', avg: 'mains ~$20' },
      { kind: 'bakery', name: 'Silverton Bakery and Cafe', rating: '4.6', en: 'Fresh pastries, pies, sausage rolls, coffee.', it: 'Paste fresche, torte, rotoli di salsiccia, caffè.', q: 'Silverton Bakery and Cafe', hours: 'Daily 7:00–16:00', avg: 'snacks ~$8' }
    ]
  },

  // ---- Day 5 · Tue 4 Aug · Pimba / Woomera -------------------------------
  '2026-08-04': {
    photo: { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/Woomera.jpg/960px-Woomera.jpg', credit: 'Diceman', license: 'Public domain', alt: 'Woomera rocket display' },
    warn: { en: 'Fill up on fuel & water here — long dry stretches either way.', it: 'Fate benzina e acqua qui — lunghi tratti deserti in entrambe le direzioni.' },
    coverage: { telstra: 'good', optus: 'patchy', note: 'Telstra at the roadhouse/town; Optus intermittent. Nothing between stops.' },
    todo: [
      { id: 'missile-park', cat: 'science', name: 'Woomera Missile Park', en: 'Free outdoor rocket & missile display.', it: 'Parco di razzi e missili all’aperto, gratis.', dur: '45 min', q: 'Woomera Missile Park South Australia', hours: '24/7' },
      { id: 'heritage-centre', cat: 'heritage', name: 'Woomera Heritage Centre', en: 'Rocket-range history, Kokatha artefacts.', it: 'Storia del poligono, reperti Kokatha.', dur: '45–60 min', q: 'Woomera Heritage and Visitor Information Centre', hours: 'Daily 9:00–17:00' },
      { id: 'lake-hart', cat: 'lookout', name: 'Lake Hart lookout', en: 'Huge roadside salt lake, great photo stop.', it: 'Enorme lago salato, sosta foto.', dur: '20–30 min', q: 'Lake Hart Lookout Stuart Highway South Australia', hours: '24/7', where: 'Stuart Hwy' },
      { id: 'woomera-town', cat: 'drive', name: 'Woomera township drive', en: 'Former secret rocket town: church, cemetery.', it: 'Ex città segreta dei razzi: chiesa, cimitero.', dur: '30 min', q: 'Woomera township South Australia', hours: '24/7' }
    ],
    food: [
      { kind: 'roadhouse', name: "Spud's Roadhouse", rating: '', en: 'Iconic fuel/food/beds; steak & schnitzel.', it: 'Storico fuel/cibo/letti; bistecca e schnitzel.', q: "Spud's Roadhouse Pimba", hours: 'Daily 6:00–22:00', avg: 'counter meals ~$18' },
      { kind: 'pub', name: 'Eldo Hotel — Oasis Bar', rating: '4.0', en: "1960s rocket-town pub, hearty counter meals.", it: 'Pub del 1960, piatti sostanziosi al banco.', q: 'Eldo Hotel Woomera', where: 'Woomera', hours: 'Daily 12:00–23:00 (café from 6:00)', avg: 'mains ~$28' }
    ]
  },

  // ---- Day 6 · Wed 5 Aug · Coober Pedy -----------------------------------
  '2026-08-05': {
    photo: { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/bb/Coober_Pedy%2C_South_Australia_-_town.jpg/960px-Coober_Pedy%2C_South_Australia_-_town.jpg', credit: 'Rob Chandler', license: 'CC BY 2.0', alt: 'Coober Pedy town' },
    warn: { en: 'Good supply town — stock up food, water & fuel before the NT.', it: 'Buona città per rifornimenti — fate scorta di cibo, acqua e benzina prima del NT.' },
    coverage: { telstra: 'good', optus: 'good', note: 'Both serve the town; nothing reliable just outside it.' },
    todo: [
      { id: 'old-timers', cat: 'mine', name: 'Old Timers Mine', en: 'Self-guided 1916 mine, underground home.', it: 'Miniera del 1916 e casa sotterranea, visita libera.', dur: '1–1.5 h', q: 'Old Timers Mine Coober Pedy', hours: 'Daily 8:30–17:30' },
      { id: 'umoona', cat: 'mine', name: 'Umoona Opal Mine & Museum', en: 'Guided mine tour, free museum.', it: 'Tour guidato in miniera, museo gratuito.', dur: '1 h', q: 'Umoona Opal Mine and Museum Coober Pedy', hours: 'Daily 8:30–17:30 (tours 10:00, 14:00, 16:00)' },
      { id: 'fayes', cat: 'heritage', name: "Faye's Underground Home", en: 'Hand-dug home built by three women.', it: 'Casa scavata a mano da tre donne.', dur: '30–45 min', q: "Faye's Historic Underground Home Coober Pedy", hours: 'Mon–Sat 8:30–17:00; Sun 14:00–17:00' },
      { id: 'breakaways', cat: 'drive', name: 'Kanku-Breakaways & Dog Fence', en: 'Scenic drive: colourful mesas, Moon Plain.', it: 'Strada panoramica: mesa colorate, Moon Plain.', dur: '2–3 h', q: 'Kanku-Breakaways Conservation Park lookout', hours: '24/7 (entry permit required)' },
      { id: 'churches', cat: 'church', name: 'Underground churches', en: 'Carved-rock churches 17 m below ground.', it: 'Chiese scavate nella roccia, 17 m sottoterra.', dur: '30 min', q: 'Serbian Orthodox Church Coober Pedy underground', hours: '24/7 (self-guided)' },
      { id: 'noodling', cat: 'mine', name: 'Noodling for opal', en: 'Fossick for opal on permitted mullock heaps.', it: 'Cerca opali sui cumuli consentiti.', dur: '1 h+', q: 'Coober Pedy noodling area', hours: '24/7 (permitted areas)' },
      { id: 'golf', cat: 'star', name: 'Coober Pedy Golf Club', en: 'Grassless course; glow-ball night golf.', it: 'Campo senza erba; golf notturno con palline luminose.', dur: '1–2 h', q: 'Coober Pedy Golf Club', hours: 'Pay & play; night events ~18:00' }
    ],
    food: [
      { kind: 'cafe', name: 'Crystal Cafe (Desert Cave)', rating: '', en: 'Underground hotel cafe; buffet breakfast.', it: 'Caffè d’hotel sotterraneo; colazione a buffet.', q: 'Crystal Cafe Desert Cave Hotel Coober Pedy', hours: 'Daily 7:00–14:00', avg: 'mains ~$28' },
      { kind: 'restaurant', name: "John's Pizza Bar", rating: '', en: 'Long-running family pizza & Italian.', it: 'Storica pizzeria/trattoria di famiglia.', q: "John's Pizza Bar Coober Pedy", hours: 'Daily 10:00–21:00', avg: 'mains ~$22' },
      { kind: 'pub', name: 'Outback Bar & Grill', rating: '', en: 'Steaks and casual outback pub grub.', it: 'Bistecche e piatti da pub.', q: 'Outback Bar and Grill Coober Pedy', hours: 'Mon–Sat 7:00–21:00; Sun 7:00–20:00', avg: 'mains $28–38' }
    ]
  },

  // ---- Day 7 · Thu 6 Aug · Kings Creek / Kings Canyon --------------------
  '2026-08-06': {
    photo: { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/11/ViewFromKingsCanyon.JPG/960px-ViewFromKingsCanyon.JPG', credit: 'Toby Hudson', license: 'CC BY-SA 3.0', alt: 'View from Kings Canyon' },
    warn: { en: 'Limited, pricey supplies — top up food/water. Buy the Mereenie Loop permit & carry a spare tyre.', it: 'Rifornimenti scarsi e cari — fate scorta. Permesso Mereenie Loop e ruota di scorta.' },
    coverage: { telstra: 'patchy', optus: 'patchy', note: 'Small Telstra cell at the resort; both drop on the walks and en route.' },
    todo: [
      { id: 'rim-walk', cat: 'walk', name: 'Kings Canyon Rim Walk', en: 'Iconic 6 km loop; rim & Garden of Eden.', it: 'Anello iconico di 6 km; Giardino dell’Eden.', dur: '3–4 h', q: 'Kings Canyon Rim Walk carpark Watarrka National Park', hours: '24/7 (gate shuts 9:00 if forecast ≥36°C)' },
      { id: 'creek-walk', cat: 'walk', name: 'Kings Canyon Creek Walk', en: 'Easier canyon-floor walk.', it: 'Passeggiata più facile sul fondo del canyon.', dur: '1–2 h', q: 'Kings Canyon Creek Walk Watarrka National Park', hours: '24/7' },
      { id: 'kathleen', cat: 'walk', name: 'Kathleen Springs Walk', en: 'Flat, accessible walk to a spring waterhole.', it: 'Passeggiata piana a una pozza sorgiva.', dur: '1–1.5 h', q: 'Kathleen Springs Walk Watarrka National Park', hours: '24/7' },
      { id: 'karrke', cat: 'art', name: 'Karrke Aboriginal Experience', en: 'Guided Luritja bush-tucker & culture walk.', it: 'Camminata guidata Luritja su cultura e bush tucker.', dur: '1 h', q: 'Karrke Aboriginal Cultural Experience Kings Canyon', hours: 'Tours Wed–Fri 10:30, 14:00 (Feb–Oct)' },
      { id: 'camel-station', cat: 'wildlife', name: 'Kings Creek Station', en: 'Camel rides & famous camel burgers.', it: 'Giri in cammello e famosi camel burger.', dur: '1 h', q: 'Kings Creek Station', hours: 'Daytime' }
    ],
    food: [
      { kind: 'station', name: 'Kings Creek Station cafe', rating: '4.0', en: 'Famous camel burgers, cooked meals, GF options.', it: 'Camel burger famosi, piatti caldi, opzioni senza glutine.', q: 'Kings Creek Station cafe', hours: 'Breakfast–dinner (kitchen to ~18:30)', avg: 'counter meals ~$18' },
      { kind: 'pub', name: 'Kings Canyon Resort Bar & Grill', rating: '', en: 'Outback pub dining: pizzas, burgers.', it: 'Cucina da pub: pizze e burger.', q: 'Kings Canyon Resort Bar and Grill', hours: 'Daily 11:00–late', avg: 'mains ~$34' }
    ]
  },

  // ---- Day 8 · Fri 7 Aug · Ridgetop / Redbank (camp) ---------------------
  '2026-08-07': {
    photo: { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/20/Redbank_Gorge_-_Northern_Territory.jpeg/960px-Redbank_Gorge_-_Northern_Territory.jpeg', credit: 'Ian Cochrane', license: 'CC BY 2.0', alt: 'Redbank Gorge, West MacDonnell Ranges' },
    warn: { en: 'No food here — carry all meals, water & fuel (nearest supply: Alice Springs).', it: 'Niente cibo qui — portate tutto, acqua e benzina (rifornimenti: Alice Springs).' },
    coverage: { telstra: 'none', optus: 'none', note: 'No signal on the Mereenie Loop or at Redbank/Ridgetop. Tell someone your plan.' },
    link: { url: "https://www.google.com/maps/dir/Ginty's+Lookout,+Mereenie+NT+0872/Gosses+Bluff+Crater,+Hermannsburg+NT+0872/Redbank+Gorge,+Mount+Zeil+NT+0872/Ormiston+Gorge+Campground,+Ormiston+Gorge+Access,+Mount+Zeil+NT+0872/Serpentine+Gorge,+Namatjira+NT+0872/Ellery+Creek+Campground,+Ellery+Big+Hole,+Namatjira+NT+0872/Standley+Chasm,+Hugh+NT+0872/Simpsons+Gap,+Burt+Plain+NT+0872/@-23.8107548,131.9136489,203691m/data=!3m1!1e3!4m50!4m49!1m5!1m1!1s0x2b3b84fbacbfcfdd:0x93549646de7bc8a!2m2!1d131.408325!2d-24.0609908!1m5!1m1!1s0x2b3a6165c4186b3d:0xd995b3b467d3a373!2m2!1d132.306861!2d-23.819081!1m5!1m1!1s0x2b305bad05697b51:0x207b39cd346c9894!2m2!1d132.5198625!2d-23.5658364!1m5!1m1!1s0x2b308f50ac4084a5:0x1b77e95d63edbb7!2m2!1d132.7270455!2d-23.6331946!1m5!1m1!1s0x2b305ae0fa9eb6b7:0x1e5ea43d0e271237!2m2!1d132.978581!2d-23.7502886!1m5!1m1!1s0x2b304fe6a5e0bb59:0xe8bf3164b2e3d0b3!2m2!1d133.0725167!2d-23.7803328!1m5!1m1!1s0x2b31be117b944c7b:0xc665863abc970c8d!2m2!1d133.4697823!2d-23.7220649!1m5!1m1!1s0x2b318b5e3ba6c641:0xa6480be844a9e480!2m2!1d133.7193309!2d-23.674068!3e0?entry=ttu", en: 'Drive the full Mereenie Loop Track (Ginty’s → Simpsons Gap)', it: 'Percorri tutto il Mereenie Loop (Ginty’s → Simpsons Gap)' },
    todo: [
      { id: 'gintys', cat: 'lookout', name: "Ginty's Lookout", en: 'Roadside view back over the escarpment.', it: 'Belvedere sulla scarpata.', dur: '20–30 min', q: "Ginty's Lookout Mereenie Loop Road", hours: '24/7 (4WD final approach)', where: 'Mereenie Loop' },
      { id: 'gosse-bluff', cat: 'lookout', name: 'Tnorala (Gosse Bluff)', en: '142-million-year-old comet crater rim.', it: 'Cratere da cometa di 142 milioni di anni.', dur: '1 h', q: 'Tnorala Gosse Bluff Conservation Reserve', hours: '24/7 (picnic/rim area; last 5 km 4WD)', where: 'Mereenie Loop' },
      { id: 'redbank-swim', cat: 'swim', name: 'Redbank Gorge', en: 'Narrow gorge waterhole — deep and icy.', it: 'Pozza in gola stretta — profonda e gelida.', dur: '1.5 h', q: 'Redbank Gorge carpark West MacDonnell National Park', hours: '24/7 (last 5 km 4WD)' },
      { id: 'mt-sonder', cat: 'lookout', name: 'Mt Sonder sunset', en: 'Sunset glow over Mt Sonder from camp.', it: 'Tramonto sul Mt Sonder dal campo.', dur: '30 min', q: 'Mount Sonder viewpoint Redbank Gorge', hours: '24/7' }
    ]
  },

  // ---- Day 9 · Sat 8 Aug · Ellery Creek (camp) ---------------------------
  '2026-08-08': {
    photo: { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/29/Ellery_Creek_Big_Hole_-_West_Macdonnell_Ranges_NT.jpg/960px-Ellery_Creek_Big_Hole_-_West_Macdonnell_Ranges_NT.jpg', credit: 'Iambexta', license: 'CC BY-SA 4.0', alt: 'Ellery Creek Big Hole' },
    warn: { en: 'Only kiosk food is at Ormiston — carry all supplies for camp.', it: 'Cibo solo al chiosco di Ormiston — portate tutte le scorte per il campo.' },
    coverage: { telstra: 'patchy', optus: 'patchy', note: 'A little Telstra at Standley Chasm / Optus at Ormiston; gorges mostly none.' },
    todo: [
      { id: 'ormiston', cat: 'walk', name: 'Ormiston Gorge', en: 'Ghost Gum Walk (~1.5 h); kiosk for lunch.', it: 'Ghost Gum Walk (~1,5 h); chiosco per pranzo.', dur: '1.5 h', q: 'Ormiston Gorge West MacDonnell National Park', hours: '24/7', where: 'Namatjira Dr' },
      { id: 'serpentine', cat: 'lookout', name: 'Serpentine Gorge', en: 'Narrow gorge; steep lookout climb.', it: 'Gola stretta; salita ripida al belvedere.', dur: '45 min–1 h', q: 'Serpentine Gorge West MacDonnell National Park', hours: '24/7', where: 'Namatjira Dr' },
      { id: 'ellery-swim', cat: 'swim', name: 'Ellery Creek Big Hole', en: 'Short walk to a deep, icy waterhole.', it: 'Breve cammino a una pozza profonda e gelida.', dur: '20–30 min', q: 'Ellery Creek Big Hole West MacDonnell National Park', hours: '24/7' }
    ],
    food: [
      { kind: 'cafe', name: 'Ormiston Gorge Kiosk', rating: '', en: 'Steak sandwiches, scones, cakes.', it: 'Panini, scones, torte.', q: 'Ormiston Gorge Kiosk', hours: 'Daily 10:00–16:00 (can close low season)', avg: 'counter meals ~$16' }
    ]
  },

  // ---- Day 10 · Sun 9 Aug · Alice Springs --------------------------------
  '2026-08-09': {
    photo: { url: 'https://upload.wikimedia.org/wikipedia/commons/d/d8/Alice_Springs_ridge.jpeg', credit: 'Stephen Codrington', license: 'CC BY 2.5', alt: 'Alice Springs and the MacDonnell Ranges' },
    coverage: { telstra: 'good', optus: 'good', note: 'Full 4G/5G both carriers — last big hub; stock up before the drive south.' },
    todo: [
      { id: 'standley', cat: 'lookout', name: 'Standley Chasm', en: 'Red-walled chasm, glowing best at midday.', it: 'Gola dalle pareti rosse, top a mezzogiorno.', dur: '1–1.5 h', q: 'Standley Chasm Angkerle Atwatye', hours: 'Mon–Sat 8:00–17:00; Sun/PH 8:00–14:00 (fee)', where: 'West MacDonnells' },
      { id: 'simpsons-gap', cat: 'walk', name: 'Simpsons Gap', en: 'Easy gap walk; black-footed rock wallabies.', it: 'Facile cammino; wallaby delle rocce.', dur: '1 h', q: 'Simpsons Gap West MacDonnell National Park', hours: '24/7', where: 'West MacDonnells' },
      { id: 'desert-park', cat: 'wildlife', name: 'Alice Springs Desert Park', en: 'Walk-through habitats; birds-of-prey show.', it: 'Habitat da attraversare; spettacolo di rapaci.', dur: '2.5–3 h', q: 'Alice Springs Desert Park', hours: 'Daily 7:30–18:00 (last entry 16:30)' },
      { id: 'anzac-hill', cat: 'lookout', name: 'ANZAC Hill (Untyeyetwelye)', en: '360° views over town and the ranges.', it: 'Vista a 360° su città e catene montuose.', dur: '20–30 min', q: 'ANZAC Hill Lookout Alice Springs', hours: '24/7' },
      { id: 'telegraph', cat: 'heritage', name: 'Telegraph Station', en: '1870s Overland Telegraph, the town’s birthplace.', it: 'Telegrafo del 1870, origine della città.', dur: '1–1.5 h', q: 'Alice Springs Telegraph Station Historical Reserve', hours: 'Daily 8:00–21:00 (buildings to 16:00)' },
      { id: 'todd-mall', cat: 'art', name: 'Todd Mall', en: 'Aboriginal art galleries, cafes, Sunday markets.', it: 'Gallerie d’arte aborigena, caffè, mercati domenicali.', dur: '1–2 h', q: 'Todd Mall Alice Springs', hours: '24/7 (shops vary)' }
    ],
    food: [
      { kind: 'cafe', name: 'Page 27 Cafe', rating: '4.5', en: 'Ranked #1 in town; top brunch and coffee.', it: '#1 in città; brunch e caffè top.', q: 'Page 27 Cafe Todd Mall Alice Springs', hours: 'Mon–Fri 7:00–14:00; Sat–Sun 7:30–14:00', avg: 'brunch ~$18' },
      { kind: 'restaurant', name: 'Simply Korean', rating: '4.6', en: 'Local favourite; Korean BBQ and hot pots.', it: 'Preferito locale; BBQ coreano e hot pot.', q: 'Simply Korean Restaurant Alice Springs', hours: 'Mon–Sat 17:30–21:30', avg: 'mains ~$26' },
      { kind: 'cafe', name: 'Watertank Cafe', rating: '4.5', en: 'Industrial-chic garden cafe; great coffee.', it: 'Caffè giardino industrial-chic; ottimo caffè.', q: 'Watertank Cafe Alice Springs', hours: 'Mon, Wed–Fri 7:30–14:00; Sat–Sun 8:00–14:00', avg: 'brunch ~$20' },
      { kind: 'pub', name: 'Epilogue Lounge', rating: '4.4', en: 'Rooftop bar; tapas menu and live music.', it: 'Bar sul tetto; tapas e musica dal vivo.', q: 'Epilogue Lounge Alice Springs', hours: 'Tue–Sun from 7:00 (Wed–Sat till late)', avg: 'mains ~$22' },
      { kind: 'cafe', name: 'Standley Chasm kiosk', rating: '', en: 'Barista coffee, home-baked scones, lunches.', it: 'Caffè, scones fatti in casa, pranzi.', q: 'Standley Chasm cafe', where: 'Standley Chasm', hours: 'Mon–Sat 8:00–17:00; Sun 8:00–14:00', avg: 'counter meals ~$16' }
    ]
  },

  // ---- Day 11 · Mon 10 Aug · Marla ---------------------------------------
  '2026-08-10': {
    photo: { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e7/Travellers_Rest%2C_Marla.jpg/960px-Travellers_Rest%2C_Marla.jpg', credit: 'Ed Dunens', license: 'CC BY 2.0', alt: 'Marla Travellers Rest' },
    warn: { en: 'Marla is a highway roadhouse stop — the roadhouse is the only food.', it: 'Marla è una sosta roadhouse — il roadhouse è l’unico posto per mangiare.' },
    coverage: { telstra: 'good', optus: 'patchy', note: 'Telstra at the roadhouse; Optus intermittent. Long dead stretches around it.' },
    todo: [
      { id: 'art-gallery', cat: 'art', name: 'Marla Travellers Rest gallery', en: 'Indigenous art & displays in the roadhouse.', it: 'Arte indigena e mostre nel roadhouse.', dur: '15–20 min', q: 'Marla Travellers Rest Marla SA', hours: '24/7' },
      { id: 'ghan-view', cat: 'lookout', name: 'The Ghan railway line', en: 'Watch the track stretch to the horizon.', it: 'Guarda i binari sparire all’orizzonte.', dur: '10 min', q: 'Marla SA railway', hours: '24/7' },
      { id: 'oodnadatta', cat: 'drive', name: 'Oodnadatta Track terminus', en: 'Photo at the famous outback track’s end.', it: 'Foto all’inizio della celebre pista outback.', dur: '10 min', q: 'Oodnadatta Track Marla SA', hours: '24/7' }
    ],
    food: [
      { kind: 'roadhouse', name: 'Marla Travellers Rest', rating: '3.5', en: 'The only place in town — roadhouse meals.', it: 'L’unico locale in paese — piatti da roadhouse.', q: 'Marla Travellers Rest Marla SA', hours: '24/7 (happy hour 17:00–18:00)', avg: 'mains ~$22' }
    ]
  },

  // ---- Day 12 · Tue 11 Aug · Port Augusta --------------------------------
  '2026-08-11': {
    photo: { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/50/Jacaranda_Time_Port_Augusta.jpg/960px-Jacaranda_Time_Port_Augusta.jpg', credit: 'GeorgieSharp', license: 'CC BY-SA 3.0', alt: 'Port Augusta waterfront' },
    coverage: { telstra: 'good', optus: 'good', note: 'Strong coverage both networks — regional gateway city.' },
    todo: [
      { id: 'botanic', cat: 'garden', name: 'Australian Arid Lands Botanic Garden', en: 'Arid-zone flora, birds, gulf & range views.', it: 'Flora arida, uccelli, vista su golfo e monti.', dur: '1–1.5 h', q: 'Australian Arid Lands Botanic Garden Port Augusta', hours: 'Daily 7:30–sunset' },
      { id: 'water-tower', cat: 'lookout', name: 'Water Tower Lookout', en: '90 steps to 360° gulf & Flinders views.', it: '90 gradini per vista a 360° sul golfo.', dur: '20–30 min', q: 'Water Tower Lookout Port Augusta', hours: '24/7 (occasionally closed)' },
      { id: 'wadlata', cat: 'heritage', name: 'Wadlata Outback Centre', en: '“Tunnel of Time” walk-through outback history.', it: '“Tunnel del Tempo”, storia dell’outback.', dur: '1–1.5 h', q: 'Wadlata Outback Centre Port Augusta', hours: 'Mon–Fri 9:00–17:00; Sat–Sun 10:00–16:00' },
      { id: 'foreshore', cat: 'walk', name: 'Foreshore & Marina', en: 'Easy walk along the Spencer Gulf waterfront.', it: 'Passeggiata sul lungomare dello Spencer Gulf.', dur: '30–45 min', q: 'Port Augusta Foreshore', hours: '24/7' }
    ],
    food: [
      { kind: 'cafe', name: "Archers' Table", rating: '4.6', en: 'Top-rated; generous cooked breakfasts.', it: 'Il più votato; ricche colazioni cotte.', q: 'Archers Table Port Augusta', hours: 'Mon–Fri 7:00–15:00; Sat 7:00–12:00; Sun 8:00–12:00', avg: 'brunch ~$22' },
      { kind: 'cafe', name: "Mamma Lou's", rating: '4.0', en: 'In the old railway station; watch trains pass.', it: 'Nella vecchia stazione; guarda passare i treni.', q: "Mamma Lou's Port Augusta", hours: 'Mon–Fri 7:30–14:30; Sat–Sun 8:00–13:00', avg: 'brunch ~$18' },
      { kind: 'restaurant', name: 'Curries by Beard Brothers', rating: '4.5', en: 'New; authentic Indian, generous portions.', it: 'Nuovo; indiano autentico, porzioni abbondanti.', q: 'Curries by Beard Brothers Port Augusta', hours: 'Daily lunch/dinner (see Google)', avg: 'mains ~$22' },
      { kind: 'cafe', name: 'Botanic Garden Cafe', rating: '4.3', en: 'Garden-view lunch inside the botanic garden.', it: 'Pranzo con vista sul giardino botanico.', q: 'Australian Arid Lands Botanic Garden Cafe', hours: 'Mon–Fri 9:00–15:00; Sat–Sun 10:00–14:00', avg: 'light meals ~$16' }
    ]
  },

  // ---- Day 13 · Wed 12 Aug · Hay -----------------------------------------
  '2026-08-12': {
    photo: { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b6/Hay_Water_Tower_Art%2C_Hay%2C_New_South_Wales%2C_2022%2C_04.jpg/960px-Hay_Water_Tower_Art%2C_Hay%2C_New_South_Wales%2C_2022%2C_04.jpg', credit: 'Kgbo', license: 'CC BY-SA 4.0', alt: 'Hay Water Tower art, NSW' },
    coverage: { telstra: 'good', optus: 'patchy', note: 'Telstra reliable in town/highway; Optus weaker outside the centre.' },
    todo: [
      { id: 'shear-outback', cat: 'heritage', name: 'Shear Outback', en: 'Shearing heritage centre & Hall of Fame.', it: 'Centro sulla tosatura & Hall of Fame.', dur: '1–1.5 h', q: 'Shear Outback Hay NSW', hours: 'Mon–Sat 9:00–16:00; Sun 9:00–15:00' },
      { id: 'dunera', cat: 'heritage', name: 'Dunera Museum', en: 'WWII internment history of the Dunera Boys.', it: 'Storia dell’internamento dei Dunera Boys.', dur: '45–60 min', q: 'Dunera Museum Hay NSW', hours: 'Daily 9:00–18:00' },
      { id: 'gaol', cat: 'heritage', name: 'Hay Gaol Museum', en: '1878 gaol turned local-history museum.', it: 'Prigione del 1878, ora museo di storia locale.', dur: '30–45 min', q: 'Hay Gaol Museum Hay NSW', hours: 'Daily 9:00–17:00' },
      { id: 'bidgee-trail', cat: 'walk', name: 'Bidgee Riverside Trail', en: 'Murrumbidgee riverbank walk & sculptures.', it: 'Passeggiata sul Murrumbidgee tra sculture.', dur: '30–45 min', q: 'Sandy Point Beach Hay NSW', hours: '24/7' },
      { id: 'sunset-area', cat: 'lookout', name: 'Sunset Viewing Area', en: 'Flat-horizon sunset, 16 km north.', it: 'Tramonto sull’orizzonte piatto, 16 km a nord.', dur: '20–30 min', q: 'Sunset Viewing Area Cobb Highway Hay NSW', hours: '24/7' }
    ],
    food: [
      { kind: 'pub', name: 'South Hay Hotel', rating: '4.6', en: 'Local favourite; parmi, barramundi, big serves.', it: 'Preferito locale; parmigiana, barramundi, porzioni grandi.', q: 'South Hay Hotel Hay South NSW', hours: 'Meals: lunch Tue–Fri 12:00–14:00; dinner Mon–Sat 18:00–20:30', avg: 'mains ~$24' }
    ]
  },

  // ---- Day 14 · Thu 13 Aug · Dee Why (home) ------------------------------
  '2026-08-13': {
    photo: { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7d/Dee_Why_Beach%2C_Sydney_2019.jpg/960px-Dee_Why_Beach%2C_Sydney_2019.jpg', credit: 'AvaPine123', license: 'CC BY-SA 4.0', alt: 'Dee Why Beach, Sydney' },
    coverage: { telstra: 'good', optus: 'good', note: 'Home — full coverage both carriers.' }
  }

};
