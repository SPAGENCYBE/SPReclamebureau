// Catalogus van de webshop.
// `code` = Probo-productcode. Alleen producten in deze lijst kunnen besteld worden
// (de backend weigert alle andere codes).
//
// Tip: met GET /api/admin/probo-products?key=ADMIN_KEY krijg je de volledige
// Probo-lijst met codes, zodat je hier producten kan toevoegen of aanpassen.
// De codes hieronder (behalve banner-510) zijn voorbeelden: controleer ze in die lijst.

export const CATALOG = [
  {
    code: 'banner-510',
    title: 'Spandoek (banner 510 gr)',
    category: 'Reclameborden & spandoeken',
    description: 'Sterk PVC-spandoek voor binnen en buiten. Formaat op maat, met zoom en ringen naar keuze.',
    image: 'assets/work-borden.png',
  },
  {
    code: 'flyers',
    title: 'Flyers',
    category: 'Drukwerk',
    description: 'Flyers in verschillende formaten en papiersoorten, enkel- of dubbelzijdig.',
    image: 'assets/work-drukwerk.png',
  },
  {
    code: 'business-cards',
    title: 'Visitekaartjes',
    category: 'Drukwerk',
    description: 'Visitekaartjes met een professionele uitstraling, met afwerking naar keuze.',
    image: 'assets/work-drukwerk.png',
  },
  {
    code: 'stickers',
    title: 'Stickers',
    category: 'Stickers',
    description: 'Stickers op maat, op rol of per stuk, voor binnen en buiten.',
    image: 'assets/work-stickers.png',
  },
  {
    code: 'posters',
    title: 'Affiches',
    category: 'Drukwerk',
    description: 'Affiches en posters in groot formaat, scherp en kleurecht.',
    image: 'assets/work-drukwerk.png',
  },
];

export function findCatalogItem(code) {
  return CATALOG.find((p) => p.code === code) || null;
}
