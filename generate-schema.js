#!/usr/bin/env node
// Run whenever you add/update products: `node generate-schema.js`
// 1. Fetches live products from Stripe (via backend)
// 2. Downloads each product image into images/products/
// 3. Bakes JSON-LD with local image URLs directly into p.html
//    so Google sees everything without needing JavaScript.

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const crypto = require('crypto');

const BACKEND_URL = 'https://nkqqzklajidxqjbqyqlo.supabase.co/functions/v1/squish-backend';
const SITE_URL = 'https://3dfidgets.shop';
const HTML_FILE = path.join(__dirname, 'index.html');
const IMAGES_DIR = path.join(__dirname, 'images', 'products');

if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });

function get(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        'Referer': SITE_URL + '/',
      },
    }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
        return get(res.headers.location).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
  });
}

function getJson(url) {
  return get(url).then(r => JSON.parse(r.body.toString()));
}

function extFromContentType(ct) {
  if (!ct) return '.jpg';
  if (ct.includes('png')) return '.png';
  if (ct.includes('gif')) return '.gif';
  if (ct.includes('webp')) return '.webp';
  return '.jpg';
}

function slug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function downloadImage(imageUrl, productName) {
  const filename = slug(productName);
  // Check if we already have it (any extension)
  const existing = fs.readdirSync(IMAGES_DIR).find(f => f.startsWith(filename + '.'));
  if (existing) {
    console.log(`  [skip] ${productName} — already downloaded`);
    return `/images/products/${existing}`;
  }

  try {
    const res = await get(imageUrl);
    if (res.status !== 200) {
      console.warn(`  [warn] ${productName} — HTTP ${res.status}, keeping Stripe URL`);
      return imageUrl;
    }
    const ext = extFromContentType(res.headers['content-type']);
    const outFile = `${filename}${ext}`;
    fs.writeFileSync(path.join(IMAGES_DIR, outFile), res.body);
    console.log(`  [ok]   ${productName} → images/products/${outFile} (${Math.round(res.body.length/1024)}KB)`);
    return `/images/products/${outFile}`;
  } catch (err) {
    console.warn(`  [warn] ${productName} — download failed: ${err.message}`);
    return imageUrl;
  }
}

function absUrl(url) {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  return SITE_URL + (url.startsWith('/') ? '' : '/') + url;
}

async function main() {
  console.log('Fetching products from backend...');
  const data = await getJson(`${BACKEND_URL}/api/products`);
  const products = data.products || [];
  console.log(`Got ${products.length} products. Downloading images...\n`);

  const graph = [];
  for (const p of products) {
    if (!p || !p.priceId) continue;

    let imageUrl = p.image || '';
    if (imageUrl) {
      imageUrl = await downloadImage(imageUrl, p.name || p.priceId);
    }

    graph.push({
      '@type': 'Product',
      name: p.name || '3D Printed Fidget',
      description: p.description || '3D printed fidget toy from 3Dfidgets.shop',
      image: imageUrl ? [absUrl(imageUrl)] : undefined,
      sku: p.priceId,
      url: `${SITE_URL}/checkout.html?priceId=${encodeURIComponent(p.priceId)}&pickup=false`,
      brand: { '@type': 'Brand', name: '3Dfidgets.shop' },
      offers: {
        '@type': 'Offer',
        url: `${SITE_URL}/checkout.html?priceId=${encodeURIComponent(p.priceId)}&pickup=false`,
        priceCurrency: String(p.currency || 'AUD').toUpperCase(),
        price: ((Number(p.price || 0)) / 100).toFixed(2),
        availability: p.active === false
          ? 'https://schema.org/OutOfStock'
          : 'https://schema.org/InStock',
        seller: { '@type': 'Organization', name: '3Dfidgets.shop' },
      },
    });
  }

  const jsonld = JSON.stringify({ '@context': 'https://schema.org', '@graph': graph });

  let html = fs.readFileSync(HTML_FILE, 'utf8');
  const before = html;
  html = html.replace(
    /<script type="application\/ld\+json" id="products-jsonld">[\s\S]*?<\/script>/,
    `<script type="application/ld+json" id="products-jsonld">${jsonld}</script>`
  );

  if (html === before) {
    console.error('\nCould not find products-jsonld script tag in p.html');
    process.exit(1);
  }

  fs.writeFileSync(HTML_FILE, html, 'utf8');
  console.log(`\nDone. ${graph.length} products baked into index.html with local image URLs.`);
}

main().catch(err => { console.error('Error:', err.message); process.exit(1); });
