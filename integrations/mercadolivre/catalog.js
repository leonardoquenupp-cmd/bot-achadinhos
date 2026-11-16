// Separate diagnostic integration. It never sends messages or writes delivery history.
const API = 'https://api.mercadolibre.com';
export class MercadoLivre {
  constructor(env = process.env, fetcher = fetch) {
    this.env = env;
    this.fetcher = fetcher;
  }
  async request(path, options = {}) {
    const response = await this.fetcher(API + path, {
      ...options, signal: AbortSignal.timeout(20000),
    });
    // Do not expose response bodies, URLs, tokens or account details in errors.
    if (!response.ok) throw Error(`ml_http_${response.status}`);
    try { return await response.json(); } catch { throw Error('ml_invalid_json'); }
  }
  async authenticate() {
    if (this.env.ML_ACCESS_TOKEN?.trim()) {
      this.token = this.env.ML_ACCESS_TOKEN.trim();
      return;
    }
    if (!this.env.ML_CLIENT_ID?.trim() || !this.env.ML_CLIENT_SECRET?.trim())
      throw Error('ml_credentials_required');
    const data = await this.request('/oauth/token', {
      method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      body: new URLSearchParams({grant_type: 'client_credentials',
        client_id: this.env.ML_CLIENT_ID, client_secret: this.env.ML_CLIENT_SECRET}).toString(),
    });
    if (typeof data.access_token !== 'string' || !data.access_token)
      throw Error('ml_invalid_token_response');
    this.token = data.access_token;
  }
  async get(path) {
    if (!this.token) await this.authenticate();
    return this.request(path, {headers: {Authorization: `Bearer ${this.token}`}});
  }
  async discover(category) {
    if (!/^MLB\d+$/.test(category)) throw Error('ml_invalid_category');
    const data = await this.get(`/highlights/MLB/category/${category}`);
    if (!Array.isArray(data.content)) throw Error('ml_invalid_catalog');
    return [...new Set(data.content.filter(x => x.type === 'PRODUCT' && /^MLB\d+$/.test(x.id)).map(x => x.id))];
  }
  async product(id) {
    if (!/^MLB\d+$/.test(id)) throw Error('ml_invalid_product');
    const info = await this.get(`/products/${id}`);
    const listings = await this.get(`/products/${id}/items`);
    return normalizeProduct(info, listings);
  }
}
export function normalizeProduct(info, listings) {
  if (!/^MLB\d+$/.test(info?.id) || info.status !== 'active' ||
      typeof info.name !== 'string' || !info.name.trim() || !Array.isArray(listings?.results)) return null;
  // Never substitute a used listing, an unavailable listing or a different variant.
  const valid = listings.results.filter(x => /^MLB\d+$/.test(x.id) && x.condition === 'new' &&
    x.status === 'active' && x.currency_id === 'BRL' && Number.isFinite(x.price) && x.price > 0 &&
    Number.isFinite(x.available_quantity) && x.available_quantity > 0);
  const best = valid.sort((a, b) => a.price - b.price)[0];
  const image = info.pictures?.find(x => {
    try {const u = new URL(x.url); return u.protocol === 'https:' && !u.username && !u.password &&
      (u.hostname === 'mlstatic.com' || u.hostname.endsWith('.mlstatic.com'));} catch {return false;}
  })?.url;
  if (!best || !image) return null;
  const previous = Number.isFinite(best.original_price) && best.original_price > best.price ? best.original_price : null;
  const url = new URL(`https://www.mercadolivre.com.br/p/${info.id}`);
  url.searchParams.set('pdp_filters', `item_id:${best.id}`);
  return {productId: info.id, itemId: best.id, title: info.name.trim(), price: best.price,
    previousPrice: previous, discount: previous ? Math.floor((previous - best.price) * 100 / previous + 1e-9) : null,
    image, productUrl: url.href, freeShipping: best.shipping?.free_shipping === true,
    affiliateLink: null}; // A normal catalog URL must never be presented as an affiliate URL.
}
