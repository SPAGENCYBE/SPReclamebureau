// Catalogus van de webshop.
//
// De webshop toont automatisch ALLE actieve Probo-producten (article_group "Composed product").
// De lijst wordt 24 uur bewaard; vernieuwen kan meteen via /api/admin/refresh-catalog?key=ADMIN_KEY.
//
// FEATURED: producten die bovenaan staan, met een eigen titel en uitleg.
// HIDDEN:   Probo-codes die je NIET in de webshop wil tonen.

export const FEATURED = {
  'flyers': { title: 'Flyers', description: 'Flyers van A6 tot A3, op verschillende papiersoorten, enkel- of dubbelzijdig.' },
  'business-cards': { title: 'Visitekaartjes', description: 'Visitekaartjes op stevig papier, met of zonder laminaat.' },
  'folded-leaflets': { title: 'Folders', description: 'Gevouwen folders in verschillende formaten en vouwwijzen.' },
  'posters': { title: 'Affiches & posters', description: 'Posters van A4 tot groot formaat, scherp en kleurecht.' },
  'banner': { title: 'Spandoek', description: 'Spandoek op maat voor binnen en buiten, met zoom en ringen naar keuze.' },
  'roll-up-banner': { title: 'Roll-up banner', description: 'Roll-up banner met cassette en draagtas, ideaal voor beurzen en events.' },
  'advertising-sign': { title: 'Reclamebord', description: 'Reclamebord op maat in verschillende plaatmaterialen.' },
  'dibond': { title: 'Dibond® bord', description: 'Strak aluminium sandwichbord, weerbestendig en duurzaam.' },
  'pavement-signs': { title: 'Stoepbord', description: 'Stoepbord met eigen affiches, voor voor je zaak.' },
  'beachflags': { title: 'Beachflag', description: 'Beachflags in verschillende vormen, inclusief voet naar keuze.' },
  'vinyl-sticker': { title: 'Vinyl sticker op maat', description: 'Stickers op maat voor binnen en buiten, in elke vorm.' },
  'small-stickers': { title: 'Kleine stickers', description: 'Kleine stickers en etiketten, per stuk gesneden.' },
  'car-sticker': { title: 'Autosticker', description: 'Autostickers en voertuigbelettering in hoogwaardige folie.' },
  'window-decal': { title: 'Raamsticker', description: 'Raamstickers voor etalages en deuren.' },
};

export const HIDDEN = new Set([
  // bv. 'tiewraps',
]);

// Indeling in categorieën op basis van code + Nederlandse naam. Eerste treffer wint.
export const CATEGORIES = [
  { name: 'Accessoires', image: 'assets/work-borden.png',
    re: /holder|houder|hook|haak|haken|tiewrap|clamp|klem|spacer|velcro|klittenband|mounting|ophang|bevestig|base\b|-base|voet|kit\b|-kit|support|steun|hanger|frame-only|tas\b|bag\b|sample|staal|insert|watertank|accessor/i },
  { name: 'Drukwerk', image: 'assets/work-drukwerk.png',
    re: /flyer|folder|leaflet|business-card|visitekaart|card|kaart|menu|brochure|poster|affiche|paper|papier|letterhead|briefpapier|envelop|notitie|kalender|calendar/i },
  { name: 'Stickers & folie', image: 'assets/work-stickers.png',
    re: /sticker|folie|film|decal|ij20|ij40|vinyl|label|etiket|magnet|magneet|\bdot\b|wrap|belettering|lettering/i },
  { name: 'Vlaggen', image: 'assets/work-borden.png',
    re: /flag|vlag|banier|wimpel/i },
  { name: 'Spandoeken & banners', image: 'assets/work-borden.png',
    re: /banner|spandoek|doek|mesh|backdrop|scaffold|steiger|roll-up|rollup|tarp/i },
  { name: 'Borden & platen', image: 'assets/work-borden.png',
    re: /bord|board|sign|dibond|forex|panel|paneel|plaat|trespa|hpl|aluminium|honeycomb|acryl|plexi|re-board|reboard/i },
  { name: 'Textiel & interieur', image: 'assets/work-textiel.png',
    re: /textile|textiel|canvas|kussen|pillow|cloth|kleed|duvet|dekbed|beanbag|zitzak|parasol|wallpaper|behang|wallcover|deco|stof|fabric|doormat|mat\b|acoust/i },
  { name: 'Beurs & displays', image: 'assets/work-borden.png',
    re: /exhibition|beurs|counter|balie|display|stand|pixlip|skytube|wall|wand|tent|table|tafel/i },
];
export const OTHER = { name: 'Overige', image: 'assets/work-drukwerk.png' };

export function categorize(code, title) {
  const s = `${code} ${title}`;
  return CATEGORIES.find((c) => c.re.test(s)) || OTHER;
}
