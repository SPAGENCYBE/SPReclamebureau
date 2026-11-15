// Catalogus van de webshop.
// `code` = Probo-productcode. Alleen producten in deze lijst kunnen besteld worden
// (de backend weigert alle andere codes).
//
// Meer producten toevoegen: GET /api/admin/probo-products?key=ADMIN_KEY&page=1&per_page=100
// geeft de volledige Probo-lijst. Alle codes hieronder zijn getest op 15-11-2026.

export const CATALOG = [
  // Drukwerk
  { code: 'flyers', title: 'Flyers', category: 'Drukwerk', image: 'assets/work-drukwerk.png',
    description: 'Flyers van A6 tot A3, op verschillende papiersoorten, enkel- of dubbelzijdig.' },
  { code: 'business-cards', title: 'Visitekaartjes', category: 'Drukwerk', image: 'assets/work-drukwerk.png',
    description: 'Visitekaartjes op stevig papier, met of zonder laminaat.' },
  { code: 'folded-leaflets', title: 'Folders', category: 'Drukwerk', image: 'assets/work-drukwerk.png',
    description: 'Gevouwen folders in verschillende formaten en vouwwijzen.' },
  { code: 'posters', title: 'Affiches & posters', category: 'Drukwerk', image: 'assets/work-drukwerk.png',
    description: 'Posters van A4 tot groot formaat, scherp en kleurecht.' },

  // Reclameborden & spandoeken
  { code: 'banner', title: 'Spandoek', category: 'Borden & spandoeken', image: 'assets/work-borden.png',
    description: 'Spandoek op maat voor binnen en buiten, met zoom en ringen naar keuze.' },
  { code: 'roll-up-banner', title: 'Roll-up banner', category: 'Borden & spandoeken', image: 'assets/work-borden.png',
    description: 'Roll-up banner met cassette en draagtas, ideaal voor beurzen en events.' },
  { code: 'advertising-sign', title: 'Reclamebord', category: 'Borden & spandoeken', image: 'assets/work-borden.png',
    description: 'Reclamebord op maat in verschillende plaatmaterialen.' },
  { code: 'dibond', title: 'Dibond® bord', category: 'Borden & spandoeken', image: 'assets/work-borden.png',
    description: 'Strak aluminium sandwichbord, weerbestendig en duurzaam.' },
  { code: 'pavement-signs', title: 'Stoepbord', category: 'Borden & spandoeken', image: 'assets/work-borden.png',
    description: 'Stoepbord met eigen affiches, voor voor je zaak.' },
  { code: 'beachflags', title: 'Beachflag', category: 'Borden & spandoeken', image: 'assets/work-borden.png',
    description: 'Beachflags in verschillende vormen, inclusief voet naar keuze.' },

  // Stickers & belettering
  { code: 'vinyl-sticker', title: 'Vinyl sticker op maat', category: 'Stickers & belettering', image: 'assets/work-stickers.png',
    description: 'Stickers op maat voor binnen en buiten, in elke vorm.' },
  { code: 'small-stickers', title: 'Kleine stickers', category: 'Stickers & belettering', image: 'assets/work-stickers.png',
    description: 'Kleine stickers en etiketten, per stuk gesneden.' },
  { code: 'car-sticker', title: 'Autosticker', category: 'Stickers & belettering', image: 'assets/work-belettering.png',
    description: 'Autostickers en voertuigbelettering in hoogwaardige folie.' },
  { code: 'window-decal', title: 'Raamsticker', category: 'Stickers & belettering', image: 'assets/work-belettering.png',
    description: 'Raamstickers voor etalages en deuren.' },
];

export function findCatalogItem(code) {
  return CATALOG.find((p) => p.code === code) || null;
}
