// Regels voor drukbestanden, volgens https://apidocs.proboprints.com/guides/how-to-supply-files-for-an-order-request
// - "amount" per bestand = de oplage (voor- en achterkant tellen samen als één product).
// - Enkelzijdig (uploader "single"): één bestand (PDF/JPG/PNG).
// - Dubbelzijdig (uploader "double"): een voor- én achterkant, of één PDF met 2 pagina's (1 = voor, 2 = achter).

const isPdf = (f) => /\.pdf$/i.test(f.key || '');

/** Controleert de geüploade bestanden; geeft een foutmelding (string) of null. */
export function checkFiles(uploaderType, files, title) {
  if (!files.length) return `Upload een drukbestand voor ${title}.`;
  if (uploaderType === 'double') {
    const fronts = files.filter((f) => f.side !== 'back');
    const backs = files.filter((f) => f.side === 'back');
    if (fronts.length === 1 && backs.length === 1) return null;
    if (files.length === 1 && isPdf(files[0])) return null;
    return `${title} wordt aan twee kanten bedrukt. Upload een voorkant én een achterkant, of één PDF met 2 pagina's (pagina 1 = voorkant, pagina 2 = achterkant).`;
  }
  if (files.length > 1) return `Voor ${title} upload je één bestand. Wil je meerdere ontwerpen? Bestel ze dan als aparte producten.`;
  return null;
}

/** Bouwt het files-array voor de Probo-bestelling. */
export function proboFiles(line) {
  const q = Math.max(1, Number(line.amount) || 1);
  const type = line.uploader_type || (line.options.some((o) => /back/.test(o.code)) ? 'double' : 'single');
  const files = line.files;
  if (type === 'double') {
    const front = files.find((f) => f.side !== 'back');
    const back = files.find((f) => f.side === 'back');
    if (front && back) {
      return [
        { uri: front.uri, side: 'front', amount: q },
        { uri: back.uri, side: 'back', amount: q },
      ];
    }
    return [{ uri: files[0].uri, pages: [{ page: 1, side: 'front', amount: q }, { page: 2, side: 'back', amount: q }] }];
  }
  return [{ uri: files[0].uri, side: 'front', amount: q }];
}
