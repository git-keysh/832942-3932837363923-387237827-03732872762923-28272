/* products.js — loads products from temp/product.json,
   keeps a saved copy, and normalises them for the app. */
(function (root) {
  'use strict';
  const SC = root.SC;
  const CACHE_KEY = 'sc.products';

  const normColor = (c) => String(c || '').trim().toUpperCase().replace(/^GRAY$/, 'GREY');

  SC.normalizeProducts = (data) => {
    const arr = Array.isArray(data) ? data : data && Array.isArray(data.products) ? data.products : [];
    return arr
      .filter((p) => p && (p.name || p.id))
      .map((p) => {
        const imgs = Array.isArray(p.images) ? p.images : [];
        const colors = [], sizes = [];
        imgs.forEach((im) => {
          const c = normColor(im.color);
          if (c && !colors.includes(c)) colors.push(c);
          if (im.size && !sizes.includes(im.size)) sizes.push(im.size);
        });
        return {
          id: String(p.id || p.name),
          brand: p.brand || '',
          name: p.name || '',
          fullName: [p.brand, p.name].filter(Boolean).join(' '),
          price: SC.num(p.price),
          note: p.price_note || '',
          category: p.category || 'Other',
          type: p.type || '',
          inStock: p.stock !== false && !/out of stock|sold out|unavailable/i.test(p.price_note || ''),
          image: p.primary_image || (imgs[0] && imgs[0].src) || '',
          images: imgs.filter((im) => im && im.src).map((im) => ({ src: im.src, color: normColor(im.color) })),
          colors: p.color ? colors : [],
          hasColor: !!p.color,
          sizes: p.size ? sizes : [],
          description: p.description || '',
          order: [p.category_order || 99, p.brand_order || 99, p.item_order || 999]
        };
      })
      .sort((a, b) => a.order[0] - b.order[0] || a.order[1] - b.order[1] || a.order[2] - b.order[2] || a.name.localeCompare(b.name));
  };

  // Picture for a specific colour (falls back to the main picture).
  SC.variantImage = (p, color) => {
    const hit = color && p.images.find((im) => im.color === color);
    return (hit && hit.src) || p.image;
  };

  SC.getCachedProducts = () => {
    const c = SC.store.read(CACHE_KEY, null);
    return c && Array.isArray(c.list) ? c : { list: [], fetchedAt: 0 };
  };

  // Products come from temp/product.json, which sits in the project folder.
  SC.PRODUCT_FILE = 'temp/product.json';
  SC.refreshProducts = async () => {
    const root = (document.body && document.body.dataset.root) || '';
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), 10000) : null;
    try {
      const res = await fetch(root + SC.PRODUCT_FILE + '?v=' + Date.now(), { cache: 'no-store', signal: ctrl ? ctrl.signal : undefined });
      if (!res.ok) throw new Error('missing');
      const list = SC.normalizeProducts(await res.json());
      if (!list.length) throw new Error('empty');
      const cache = { list, fetchedAt: Date.now() };
      SC.store.write(CACHE_KEY, cache);
      return Object.assign({ ok: true }, cache);
    } catch (e) {
      return Object.assign({ ok: false, error: 'Could not load products' }, SC.getCachedProducts());
    } finally {
      if (timer) clearTimeout(timer);
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
