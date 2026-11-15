# SP Reclamebureau — webshop-backend

Kleine Cloudflare Worker die de webshop op spreclamebureau.be koppelt aan:

- **Probo** (productconfiguratie, prijzen en automatisch bestellen)
- **Mollie** (betalen met Bancontact, Payconiq, kaart)
- **Cloudflare R2** (opslag van drukbestanden) en **KV** (bestellingen)

## Hoe een bestelling loopt

1. De klant kiest een product op `webshop.html`. De Worker vraagt bij Probo de keuzes en de inkoopprijs op en rekent zelf de verkoopprijs uit (marge + btw).
2. De klant uploadt een drukbestand (PDF/JPG/PNG). Dat wordt in R2 opgeslagen.
3. Bij het afrekenen herberekent de Worker elke prijs bij Probo en maakt een Mollie-betaling aan.
4. Mollie meldt "betaald" → de Worker plaatst de bestelling bij Probo met een beveiligde downloadlink naar het bestand.
5. Probo meldt statuswijzigingen terug. De klant ziet ze op `bedankt.html`.

## Eenmalig installeren

```bash
cd shop-api
npm install
npx wrangler login
npx wrangler kv namespace create ORDERS      # id invullen in wrangler.toml
npx wrangler r2 bucket create sp-shop-files
npx wrangler secret put PROBO_TOKEN
npx wrangler secret put MOLLIE_API_KEY        # eerst de test_-sleutel
npx wrangler secret put SIGNING_SECRET        # lange willekeurige tekst
npx wrangler secret put ADMIN_KEY
npx wrangler deploy
```

Daarna:

- Zet de URL van de Worker in `wrangler.toml` (`WORKER_URL`) en deploy opnieuw.
- Zet dezelfde URL in `webshop.html` en `bedankt.html` bij `<meta name="sp-shop-api" content="...">`.

## Live gaan

1. Doe een testbestelling met de Mollie-`test_`-sleutel en `PROBO_ORDER_TYPE = "test"`. Probo annuleert testorders automatisch.
2. Controleer in het Probo-dashboard of de testorder goed binnenkomt: adres, product en bestand.
3. Zet `PROBO_ORDER_TYPE = "production"` en vervang de Mollie-sleutel door de `live_`-sleutel.

## Beheer

- `GET /api/admin/orders?key=ADMIN_KEY` toont de laatste 50 bestellingen met verkoop- en inkoopbedrag.
- `GET /api/admin/probo-products?key=ADMIN_KEY` toont de volledige Probo-productlijst. Gebruik die om `src/config.js` aan te vullen.

## Testen

```bash
npm test
```

Dit test de volledige flow met een nagebootste Probo en Mollie.
