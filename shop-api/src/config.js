// Catalogus van de webshop.
//
// De webshop toont automatisch ALLE actieve Probo-producten (article_group "Composed product").
// De lijst wordt 24 uur bewaard; vernieuwen kan meteen via /api/admin/refresh-catalog?key=ADMIN_KEY.
//
// CATEGORIES: de indeling in de webshop (volgorde = volgorde op de site).
// CATEGORY_OF: vaste categorie per Probo-code (alle 289 producten van 16-11-2026).
//   Nieuwe Probo-producten die hier nog niet staan, worden ingedeeld via FALLBACK (zoekwoorden).
// FEATURED: populaire producten met eigen titel en uitleg.
// HIDDEN:   Probo-codes die je NIET in de webshop wil tonen.

export const CATEGORIES = [
  { key: 'drukwerk', name: 'Drukwerk', blurb: 'Flyers, visitekaartjes, folders, brochures en kaarten.' },
  { key: 'posters', name: 'Posters & affiches', blurb: 'Van A4-poster tot groot formaat en lichtbakaffiches.' },
  { key: 'stickers', name: 'Stickers & folie', blurb: 'Stickers, etiketten, raam- en autofolie, magneten.' },
  { key: 'borden', name: 'Borden & platen', blurb: 'Reclameborden, stoepborden, panelen, freesletters.' },
  { key: 'spandoeken', name: 'Spandoeken & doeken', blurb: 'Spandoeken, bouwhek- en steigerdoeken, spandoekframes.' },
  { key: 'vlaggen', name: 'Vlaggen & beachflags', blurb: 'Beachflags, mast-, gevel- en baniervlaggen.' },
  { key: 'beurs', name: 'Beurs & events', blurb: 'Roll-ups, beurswanden, balies, displays en LED-frames.' },
  { key: 'interieur', name: 'Interieur & textiel', blurb: 'Canvas, fotobehang, textielframes, akoestiek, kussens.' },
  { key: 'promo', name: 'Promo & gadgets', blurb: 'Draagtassen, parasols, zitzakken en andere gadgets.' },
  { key: 'montage', name: 'Montage & toebehoren', blurb: 'Ophangsystemen, houders, tape en gereedschap.' },
];

const GROUPS = {
  drukwerk: `flyers business-cards folded-leaflets folded-leaflets-cross brochures writing-paper envelope cards greeting-card christmas-card-2 menu-cards placemats closure-seal saving-stamp doorhanger plano-printing-sheets 2024-easyprint`,
  posters: `posters posters-big advertising-posters city-light-poster self-adhesive-poster garden-poster poster-paper textile-poster mouth-mask-poster neonprint blackback samba-backlit caseprint`,
  stickers: `vinyl-sticker small-stickers car-sticker window-decal ij20-transparent ij20-white ij40-transparent ij40-white carwrap 2024-carwrap blind-spot-sticker labels etiketten-stans sticker-industrial inspection-sticker label-dispenser-box magnet magnetic-sticker real-estate-sticker wall-sticker promotional-stickers stickers-on-a-roll label-punch stickers-on-a-sheet stickers-on-sheet 2025-stickersheet floorsticker quapro-permanent quapro-promo quapro-biond-permanent static-window-film frosted-film dot`,
  borden: `advertising-sign dibond 2024-dibond 2026-dibond pavement-signs pavement-sign-watertank premium-pavement-sign-watertank pavement-sign-swing folding-sign aluminium-sign 2024-road-sign plain-panel billboard billboard-2026 2024-forex forex-v3 recycled-forex black-forex photo-on-panel birth-sign wall-sign-2026 2024-honeycombboard lamppost-sign illuminated-sign window-signboard panel panel-2026 panel-with-frame panel-mounting-system 2024-plexiglass 2024-akylite 2024-polyprop pvc-schuimplaat 2024-re-board 2026-re-board 2024-signagain signagain-tiles sign-again-floor 2024-sportfield-sign trespa-hpl timbermaxx whiteboard 2024-magnetic-board milled-lettering 2024-hexagons 2024-wall-circle wallcircle-standard advertising-sign-protection 2024-sidewalksign-insert`,
  spandoeken: `banner banner-610 banner-pvc-free banner-fixed-size plain-banner blocking-banner construction-site-banner construction-site-banner-340 constructionbanner-own crowd-barrier-banner fence-banner pole-banner scaffolding-sheet tarp xl-banner speaker-cloth hidden-banner-frame bannerframe round-aluminium-bannerframe freestanding-bannerframe`,
  vlaggen: `beachflags beachflag-drop mini-beachflag beachflag-square beachflag-straight beachflag-wave facade-banner banner-flag boatflag 2024-flagfix facade-flag golf-flag wall-flag pole-flag window-flag flag-var flagline facade-pole twin-facade-pole-holder triple-facade-pole-holder decorative-knob-facade 2024-beach-pole wallmount-bf perpendicular-banner-support banner-holder-kit`,
  beurs: `roll-up-banner roll-up-bud roll-up-del roll-up-prem roll-up-outdoor roll-up-xxl double-roll-up rollup-bud-bag 2024-rollup-spot-led x-banner l-banner exhibition-banner backdrop ceiling-banner 2024-backsplash counter counter-square exhibition-counter-kidney exhibition-frame exhibition-walls inhaker curved-pop-up-wall straight-pop-up-wall zipper-wall led-exhibition-wall beurswanden-spotjes exhibition-led-clamps aluvision-cloth pixlip-go-desk pixlip-go-frame pop-up-led ledframe outdoor-ledframe outdoor-frame outd-frame-strips clip-frame skytube partytent pos-displays pick-up-corner 2024-cardboard-stand reboard-standing-table card-holder-acryl card-holder-magnets card-holder-poly brochure-holder-2 2024-shelf-strips security-gate-cover`,
  interieur: `wallcovering wallpaper pattern-wallpaper wallpaper-circle wallpaper-sample wallpaper-glue wallpaper-glue-high wallpaper-glue-medium photo-on-framed-canvas canvas-with-frame textile-canvas textile-frame textile-frame-wall textile-frame-standing textileframe-wood outdoor-textile-frame textile-frame-acoustic texframe-accessories acoustic-panel acoustic-hexagons acoustic-pro-divider-desk acoustic-pro-divider-room wallcloth rod textile-poster-mounting throw-pillow throw-pillow-filling outdoor-pillow duvet-cover tablecloth outdoor-carpet doormats doormat-with-border floor-mats`,
  promo: `shopping-bag 2024-ice-scraper mouth-masks 2024-wine-box 2025-coasters mouse-pad beach-chair towels picnic-blanket beanbag beanbag-de parasol parasol-base`,
  montage: `knifeless-tape 2024-spacers-frees 2024-spacers-sheet yellotools yelloblade-2 yelloguide-flexi-2 baseplate-heavy baseplate-side 2024-baseplates water-bag-2 corner-protectors blind-mounting-system-standard blind-mounting-system bodyguard-knife-3 dtf-accessories ds-tape gecko-patch cable-hanging-systems velcro lockset mounting-adhesive mounting-plates panel-holders panel-base re-board-base ceiling-hooks 2024-ceiling-sign-hanger plug-in-tendon poster-hanger 2024-poster-holder poster-clamps sassercut-pro-2 masking-tape tiewraps 2024-floor-protector wallhanger pallet-cover`,
};

export const CATEGORY_OF = Object.fromEntries(
  Object.entries(GROUPS).flatMap(([cat, codes]) => codes.split(/\s+/).filter(Boolean).map((c) => [c, cat])),
);

const FALLBACK = [
  ['montage', /holder|houder|hook|haak|tiewrap|clamp|klem|spacer|velcro|mounting|ophang|baseplate|tape|knife|tool/i],
  ['beurs', /roll-?up|exhibition|beurs|counter|balie|display|pop-up|led|frame/i],
  ['vlaggen', /flag|vlag|banier/i],
  ['stickers', /sticker|folie|film|label|etiket|magnet|wrap/i],
  ['posters', /poster|affiche/i],
  ['drukwerk', /flyer|folder|leaflet|card|kaart|brochure|paper|papier|envelop|menu/i],
  ['spandoeken', /banner|spandoek|doek|mesh|tarp/i],
  ['borden', /bord|board|sign|dibond|forex|panel|paneel|plaat|plex/i],
  ['interieur', /textile|textiel|canvas|kussen|pillow|behang|wallpaper|acoust|mat\b|kleed/i],
];

export function categorize(code, title) {
  if (CATEGORY_OF[code]) return CATEGORY_OF[code];
  const s = `${code} ${title}`;
  const hit = FALLBACK.find(([, re]) => re.test(s));
  return hit ? hit[0] : 'promo';
}

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
  // Door Probo geblokkeerd voor bestellen op dit account (gecontroleerd 15-11-2026):
  'acousticpro-panel-sample', 'wallpaint', 'acoustic-budget-panel', 'flowershop', 'stain-wood-oil',
  'lacquer', 'cutting-ruler', 'quapro-permanent-pvc-free', 'textielframe-standard-formats',
]);

