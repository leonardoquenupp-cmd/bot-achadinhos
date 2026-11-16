import {MercadoLivre} from './catalog.js';
try {
  const api = new MercadoLivre();
  const category = process.env.ML_CATEGORY_ID || 'MLB1051';
  const ids = await api.discover(category);
  let found = false;
  for (const id of ids.slice(0, 5)) {
    const product = await api.product(id);
    if (product) {
      console.log(JSON.stringify({event: 'ml_catalog_preview', product, publishingEnabled: false}));
      found = true; break;
    }
  }
  if (!found) throw Error('ml_no_verified_available_product');
} catch (error) {
  const safe = /^ml_(http_\d+|invalid_[a-z_]+|credentials_required|no_verified_available_product)$/.test(error.message);
  console.error(JSON.stringify({event: 'ml_preview_failed', code: safe ? error.message : 'ml_network_or_internal'}));
  process.exitCode = 1;
}
