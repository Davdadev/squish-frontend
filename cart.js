/* ============================================================================
   cart.js — shared cart system for 3Dfidgets.shop
   ----------------------------------------------------------------------------
   Provides a single source of truth for the shopping cart, persisted in
   localStorage and synced across tabs via the `storage` event. Exposes:

     window.Cart.getItems()                     -> [{ priceId, name, price, currency, image, quantity }]
     window.Cart.add(product, qty)              -> add or increment a line
     window.Cart.setQty(priceId, qty)           -> set absolute quantity (<=0 removes)
     window.Cart.remove(priceId)
     window.Cart.clear()
     window.Cart.count()                        -> total units
     window.Cart.subtotal()                     -> total cents
     window.Cart.currency()                     -> lowercase iso, defaulted to 'aud'
     window.Cart.subscribe(cb)                  -> cb(items) every change; returns unsubscribe
     window.Cart.openDrawer() / closeDrawer()
     window.Cart.toast(msg)

   It also injects:
     • a floating cart button (top-right of every page)
     • a slide-in cart drawer
     • a toast container

   To use on a page, just include:
       <script src="cart.js" defer></script>
   The script auto-initialises after DOMContentLoaded.

   The drawer's "Checkout" button takes the user to checkout.html, which is now
   the unified cart-review/upsell/Stripe-handoff page.
============================================================================ */

(function () {
  'use strict';

  // ── Constants ─────────────────────────────────────────────────────────────
  const STORAGE_KEY = 'tdf_cart_v1';
  const BACKEND_URL = 'https://nkqqzklajidxqjbqyqlo.supabase.co/functions/v1/squish-backend';
  const FREE_SHIPPING_THRESHOLD = 5000; // $50 in cents
  const CURRENCY_SYMBOLS = { AUD: 'A$', USD: '$', GBP: '£', EUR: '€', NZD: 'NZ$', CAD: 'C$' };

  // ── State ─────────────────────────────────────────────────────────────────
  let items = loadItems();
  const subscribers = new Set();

  function loadItems() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      // Sanitize each line
      return parsed
        .filter(x => x && typeof x.priceId === 'string')
        .map(x => ({
          priceId: x.priceId,
          name: String(x.name || ''),
          price: Number(x.price) || 0,
          currency: String(x.currency || 'aud').toLowerCase(),
          image: x.image || null,
          quantity: Math.max(1, Math.min(99, Number(x.quantity) || 1)),
        }));
    } catch (e) {
      console.warn('Cart: failed to load, resetting', e);
      return [];
    }
  }

  function saveItems() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch (e) {
      console.warn('Cart: failed to save', e);
    }
    notify();
  }

  function notify() {
    subscribers.forEach(cb => { try { cb(items); } catch (e) { console.error(e); } });
    renderBadge();
    renderDrawer();
  }

  // ── Public API ────────────────────────────────────────────────────────────
  const Cart = {
    getItems() { return items.map(x => ({ ...x })); },

    add(product, qty) {
      qty = Math.max(1, Number(qty) || 1);
      if (!product || !product.priceId) return;
      const existing = items.find(x => x.priceId === product.priceId);
      if (existing) {
        existing.quantity = Math.min(99, existing.quantity + qty);
      } else {
        items.push({
          priceId: product.priceId,
          name: product.name || '',
          price: Number(product.price) || 0,
          currency: String(product.currency || 'aud').toLowerCase(),
          image: product.image || null,
          quantity: qty,
        });
      }
      saveItems();
        Cart.toast(`✨ Added ${qty} × ${product.name || 'item'} to cart`);
    },

    setQty(priceId, qty) {
      qty = Math.max(0, Math.min(99, Number(qty) || 0));
      const idx = items.findIndex(x => x.priceId === priceId);
      if (idx < 0) return;
      if (qty <= 0) {
        items.splice(idx, 1);
      } else {
        items[idx].quantity = qty;
      }
      saveItems();
    },

    remove(priceId) {
      items = items.filter(x => x.priceId !== priceId);
      saveItems();
    },

    clear() {
      items = [];
      saveItems();
    },

    count() {
      return items.reduce((n, x) => n + x.quantity, 0);
    },

    subtotal() {
      return items.reduce((n, x) => n + x.price * x.quantity, 0);
    },

    currency() {
      return items[0]?.currency || 'aud';
    },

    subscribe(cb) {
      subscribers.add(cb);
      try { cb(items); } catch (e) { console.error(e); }
      return () => subscribers.delete(cb);
    },

    openDrawer() {
      const d = document.getElementById('cart-drawer');
      if (!d) return;
      d.classList.add('open');
      document.body.style.overflow = 'hidden';
      renderDrawer();
    },

    closeDrawer() {
      const d = document.getElementById('cart-drawer');
      if (!d) return;
      d.classList.remove('open');
      document.body.style.overflow = '';
    },

    toast(msg) {
      let t = document.getElementById('cart-toast');
      if (!t) {
        t = document.createElement('div');
        t.id = 'cart-toast';
        t.className = 'cart-toast';
        document.body.appendChild(t);
      }
      t.textContent = msg;
      t.classList.add('show');
      clearTimeout(t._timer);
      t._timer = setTimeout(() => t.classList.remove('show'), 2800);
    },

    // utilities
    fmt(cents, currency) {
      const sym = CURRENCY_SYMBOLS[String(currency || 'aud').toUpperCase()] || (currency + ' ');
      return sym + ((Number(cents) || 0) / 100).toFixed(2);
    },
    sym(currency) {
      return CURRENCY_SYMBOLS[String(currency || 'aud').toUpperCase()] || (currency + ' ');
    },
    esc(s) {
      if (!s) return '';
      return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    },

    BACKEND_URL,
    FREE_SHIPPING_THRESHOLD,
  };

  // Sync between tabs
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) {
      items = loadItems();
      notify();
    }
  });

  // ── DOM injection ─────────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('cart-styles')) return;
    const css = `
      .cart-fab {
        position: fixed; top: 18px; right: 18px; z-index: 200;
        width: 56px; height: 56px; border-radius: 50%;
        background: #1a1a2e; color: #FFD93D;
        border: 3px solid #1a1a2e; box-shadow: 4px 4px 0 #FF6B35;
        display: flex; align-items: center; justify-content: center;
        cursor: pointer; transition: all .15s; font-size: 1.6rem; line-height: 1;
        font-family: 'Fredoka One', cursive;
      }
      .cart-fab:hover { transform: translate(-2px, -2px); box-shadow: 6px 6px 0 #FF6B35; }
      .cart-fab:active { transform: translate(1px, 1px); box-shadow: 2px 2px 0 #FF6B35; }
      .cart-fab .cart-badge {
        position: absolute; top: -6px; right: -6px;
        min-width: 24px; height: 24px; padding: 0 6px;
        background: #FF4D8D; color: #fff;
        border: 2px solid #1a1a2e; border-radius: 100px;
        font-family: 'Fredoka One', cursive; font-size: .75rem;
        display: flex; align-items: center; justify-content: center;
        transform: scale(0); transition: transform .2s cubic-bezier(.34,1.56,.64,1);
      }
      .cart-fab .cart-badge.show { transform: scale(1); }
      .cart-fab.bump { animation: cartBump .35s cubic-bezier(.34,1.56,.64,1); }
      @keyframes cartBump { 0%{transform:scale(1)} 50%{transform:scale(1.15)} 100%{transform:scale(1)} }

      .cart-drawer-overlay {
        position: fixed; inset: 0; z-index: 300;
        background: rgba(26,26,46,.55); backdrop-filter: blur(3px);
        opacity: 0; pointer-events: none; transition: opacity .25s;
      }
      .cart-drawer.open ~ .cart-drawer-overlay,
      .cart-drawer-overlay.open { opacity: 1; pointer-events: all; }

      .cart-drawer {
        position: fixed; top: 0; right: 0; bottom: 0; z-index: 310;
        width: min(420px, 100vw);
        background: #fff9f0;
        border-left: 3px solid #1a1a2e;
        box-shadow: -8px 0 0 rgba(26,26,46,.06);
        display: flex; flex-direction: column;
        transform: translateX(100%);
        transition: transform .3s cubic-bezier(.4,0,.2,1);
        font-family: 'Nunito', sans-serif;
      }
      .cart-drawer.open { transform: translateX(0); }

      .cart-drawer-head {
        padding: 1.1rem 1.2rem;
        background: #FF6B35; color: #fff;
        border-bottom: 3px solid #1a1a2e;
        display: flex; align-items: center; justify-content: space-between; gap: 1rem;
      }
      .cart-drawer-title {
        font-family: 'Lilita One', cursive; font-size: 1.5rem; line-height: 1;
        text-shadow: 2px 2px 0 #1a1a2e;
      }
      .cart-drawer-close {
        width: 36px; height: 36px; background: #fff; color: #1a1a2e;
        border: 2.5px solid #1a1a2e; border-radius: 50%; cursor: pointer;
        font-size: 1.1rem; line-height: 1;
        display: flex; align-items: center; justify-content: center;
        box-shadow: 2px 2px 0 #1a1a2e; transition: all .15s;
      }
      .cart-drawer-close:hover { background: #FF4D8D; color: #fff; transform: rotate(90deg); }

      .cart-drawer-body {
        flex: 1; overflow-y: auto; padding: 1rem 1.2rem;
      }
      .cart-line {
        display: grid; grid-template-columns: 64px 1fr auto; gap: .8rem;
        background: #fff; border: 2.5px solid #1a1a2e; border-radius: 14px;
        padding: .7rem; margin-bottom: .8rem; box-shadow: 3px 3px 0 #1a1a2e;
        align-items: center;
      }
      .cart-line-img {
        width: 64px; height: 64px; border-radius: 10px;
        border: 2px solid #1a1a2e; overflow: hidden;
        background: #FFD93D; display: flex; align-items: center; justify-content: center;
        font-size: 1.8rem;
      }
      .cart-line-img img { width: 100%; height: 100%; object-fit: cover; }
      .cart-line-mid { min-width: 0; }
      .cart-line-name {
        font-family: 'Fredoka One', cursive; font-size: .95rem; color: #1a1a2e;
        line-height: 1.2; margin-bottom: .25rem;
        overflow: hidden; text-overflow: ellipsis;
        display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
      }
      .cart-line-price {
        font-family: 'Lilita One', cursive; font-size: 1rem; color: #1a1a2e;
      }
      .cart-line-right {
        display: flex; flex-direction: column; align-items: flex-end; gap: .35rem;
      }
      .cart-qty {
        display: flex; align-items: center; gap: .35rem;
        background: #fff9f0; border: 2px solid #1a1a2e; border-radius: 100px;
        padding: .15rem .3rem;
      }
      .cart-qty button {
        width: 24px; height: 24px; background: #1a1a2e; color: #FFD93D;
        border: none; border-radius: 50%; cursor: pointer;
        font-family: 'Fredoka One', cursive; font-size: 1rem; line-height: 1;
        display: flex; align-items: center; justify-content: center;
        transition: all .15s; padding: 0;
      }
      .cart-qty button:hover:not(:disabled) { background: #FF6B35; transform: scale(1.1); }
      .cart-qty button:disabled { opacity: .35; cursor: not-allowed; }
      .cart-qty .qty-num {
        font-family: 'Lilita One', cursive; font-size: .95rem; color: #1a1a2e;
        min-width: 18px; text-align: center;
      }
      .cart-line-remove {
        font-family: 'Nunito', sans-serif; font-size: .72rem; font-weight: 800;
        color: #FF4D8D; background: none; border: none; cursor: pointer;
        text-decoration: underline; text-underline-offset: 2px; padding: 0;
      }
      .cart-line-remove:hover { color: #1a1a2e; }

      .cart-empty {
        text-align: center; padding: 3rem 1rem;
        font-family: 'Nunito', sans-serif;
      }
      .cart-empty-emoji { font-size: 4rem; margin-bottom: 1rem; display: block; }
      .cart-empty h3 {
        font-family: 'Lilita One', cursive; font-size: 1.4rem; margin-bottom: .4rem;
      }
      .cart-empty p { color: #666; font-weight: 600; margin-bottom: 1.2rem; }
      .cart-empty-cta {
        font-family: 'Fredoka One', cursive; font-size: .95rem;
        padding: .55rem 1.4rem; background: #FF6B35; color: #fff;
        border: 2.5px solid #1a1a2e; border-radius: 100px;
        box-shadow: 3px 3px 0 #1a1a2e; cursor: pointer; transition: all .15s;
        text-decoration: none; display: inline-block;
      }
      .cart-empty-cta:hover { transform: translate(-2px,-2px); box-shadow: 5px 5px 0 #1a1a2e; }

      .cart-drawer-foot {
        padding: 1rem 1.2rem 1.2rem;
        background: #fff;
        border-top: 3px solid #1a1a2e;
      }
      .cart-ship-bar {
        background: #fff9f0; border: 2px solid #1a1a2e; border-radius: 12px;
        padding: .55rem .7rem; margin-bottom: .8rem; font-size: .8rem; font-weight: 700;
      }
      .cart-ship-bar-track {
        background: #eee; border: 1.5px solid #1a1a2e; border-radius: 100px;
        height: 10px; overflow: hidden; margin-top: .35rem;
      }
      .cart-ship-bar-fill {
        height: 100%; background: linear-gradient(90deg, #6BCB77, #4ECDC4);
        border-radius: 100px; transition: width .5s cubic-bezier(.34,1.56,.64,1);
        min-width: 4px;
      }
      .cart-subtotal-row {
        display: flex; align-items: center; justify-content: space-between;
        margin-bottom: .9rem;
      }
      .cart-subtotal-label {
        font-family: 'Fredoka One', cursive; font-size: 1rem; color: #1a1a2e;
      }
      .cart-subtotal-val {
        font-family: 'Lilita One', cursive; font-size: 1.6rem; color: #1a1a2e;
      }
      .cart-checkout-btn {
        width: 100%; font-family: 'Lilita One', cursive; font-size: 1.15rem;
        padding: .85rem 1.5rem; background: #FF6B35; color: #fff;
        border: 3px solid #1a1a2e; border-radius: 100px;
        box-shadow: 4px 4px 0 #1a1a2e; cursor: pointer; transition: all .15s;
        letter-spacing: .3px; display: inline-flex; align-items: center;
        justify-content: center; gap: .5rem; text-decoration: none;
      }
      .cart-checkout-btn:hover:not(:disabled) {
        transform: translate(-2px,-2px); box-shadow: 6px 6px 0 #1a1a2e;
      }
      .cart-checkout-btn:disabled { background: #ccc; color: #999; cursor: not-allowed; }
      .cart-view-cart {
        display: block; text-align: center; margin-top: .65rem;
        font-family: 'Fredoka One', cursive; font-size: .85rem;
        color: #1a1a2e; text-decoration: underline; text-underline-offset: 2px;
      }
      .cart-view-cart:hover { color: #FF4D8D; }

      .cart-toast {
        position: fixed; bottom: 2rem; left: 50%;
        transform: translateX(-50%) translateY(120%);
        background: #1a1a2e; color: #FFD93D;
        font-family: 'Fredoka One', cursive; font-size: .95rem;
        padding: .75rem 1.6rem; border-radius: 100px;
        border: 2.5px solid #FFD93D; box-shadow: 4px 4px 0 #FFD93D;
        z-index: 1000; pointer-events: none; white-space: nowrap;
        transition: transform .35s cubic-bezier(.34,1.56,.64,1);
      }
      .cart-toast.show { transform: translateX(-50%) translateY(0); }

      @media (max-width: 600px) {
        .cart-fab { top: 12px; right: 12px; width: 48px; height: 48px; font-size: 1.3rem; }
        .cart-drawer { width: 100vw; }
      }
    `;
    const style = document.createElement('style');
    style.id = 'cart-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  function injectFab() {
    if (document.getElementById('cart-fab')) return;
    const btn = document.createElement('button');
    btn.id = 'cart-fab';
    btn.className = 'cart-fab';
    btn.setAttribute('aria-label', 'Open cart');
    btn.innerHTML = `
      <span aria-hidden="true">🛒</span>
      <span class="cart-badge" id="cart-badge">0</span>
    `;
    btn.addEventListener('click', () => Cart.openDrawer());
    document.body.appendChild(btn);
  }

  function injectDrawer() {
    if (document.getElementById('cart-drawer')) return;
    const overlay = document.createElement('div');
    overlay.id = 'cart-drawer-overlay';
    overlay.className = 'cart-drawer-overlay';
    overlay.addEventListener('click', () => Cart.closeDrawer());
    document.body.appendChild(overlay);

    const drawer = document.createElement('aside');
    drawer.id = 'cart-drawer';
    drawer.className = 'cart-drawer';
    drawer.setAttribute('aria-label', 'Shopping cart');
    drawer.innerHTML = `
      <div class="cart-drawer-head">
        <div class="cart-drawer-title">🛒 Your Cart</div>
        <button class="cart-drawer-close" aria-label="Close cart">✕</button>
      </div>
      <div class="cart-drawer-body" id="cart-drawer-body"></div>
      <div class="cart-drawer-foot" id="cart-drawer-foot"></div>
    `;
    document.body.appendChild(drawer);

    drawer.querySelector('.cart-drawer-close').addEventListener('click', () => Cart.closeDrawer());

    // close drawer when clicking outside (overlay handles this) and on Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') Cart.closeDrawer();
    });

    // sync overlay open state with drawer state
    new MutationObserver(() => {
      overlay.classList.toggle('open', drawer.classList.contains('open'));
    }).observe(drawer, { attributes: true, attributeFilter: ['class'] });
  }

  function renderBadge() {
    const badge = document.getElementById('cart-badge');
    const fab = document.getElementById('cart-fab');
    if (!badge || !fab) return;
    const n = Cart.count();
    badge.textContent = n > 99 ? '99+' : String(n);
    badge.classList.toggle('show', n > 0);
    // bump animation
    if (badge.dataset.last !== String(n)) {
      if (badge.dataset.last !== undefined && n > Number(badge.dataset.last || 0)) {
        fab.classList.remove('bump');
        // force reflow so animation can replay
        void fab.offsetWidth;
        fab.classList.add('bump');
      }
      badge.dataset.last = String(n);
    }
  }

  function renderDrawer() {
    const body = document.getElementById('cart-drawer-body');
    const foot = document.getElementById('cart-drawer-foot');
    if (!body || !foot) return;
    if (!items.length) {
      body.innerHTML = `
        <div class="cart-empty">
          <span class="cart-empty-emoji">🛒</span>
          <h3>Your cart is empty</h3>
          <p>Find a fidget you love and add it here!</p>
          <a class="cart-empty-cta" href="index.html">Browse fidgets</a>
        </div>`;
      foot.innerHTML = '';
      return;
    }
    body.innerHTML = items.map((x) => {
      const imgHtml = x.image
        ? `<img src="${Cart.esc(x.image)}" alt="${Cart.esc(x.name)}" />`
        : `<span></span>`;
      return `
        <div class="cart-line">
          <div class="cart-line-img">${imgHtml}</div>
          <div class="cart-line-mid">
            <div class="cart-line-name">${Cart.esc(x.name)}</div>
            <div class="cart-line-price">${Cart.fmt(x.price * x.quantity, x.currency)}</div>
          </div>
          <div class="cart-line-right">
            <div class="cart-qty">
              <button data-action="dec" data-id="${Cart.esc(x.priceId)}" aria-label="Decrease">−</button>
              <span class="qty-num">${x.quantity}</span>
              <button data-action="inc" data-id="${Cart.esc(x.priceId)}" aria-label="Increase" ${x.quantity >= 99 ? 'disabled' : ''}>+</button>
            </div>
            <button class="cart-line-remove" data-action="rm" data-id="${Cart.esc(x.priceId)}">Remove</button>
          </div>
        </div>`;
    }).join('');

    body.querySelectorAll('[data-action]').forEach(el => {
      el.addEventListener('click', () => {
        const id = el.dataset.id;
        const line = items.find(x => x.priceId === id);
        if (!line) return;
        if (el.dataset.action === 'inc') Cart.setQty(id, line.quantity + 1);
        else if (el.dataset.action === 'dec') Cart.setQty(id, line.quantity - 1);
        else if (el.dataset.action === 'rm') Cart.remove(id);
      });
    });

    const subtotal = Cart.subtotal();
    const cur = Cart.currency();
    const sym = Cart.sym(cur);
    const toGo = Math.max(0, FREE_SHIPPING_THRESHOLD - subtotal);
    const pct = Math.min(100, (subtotal / FREE_SHIPPING_THRESHOLD) * 100);
    const shipMsg = toGo > 0
      ? `Add <strong>${sym}${(toGo/100).toFixed(2)}</strong> more for <strong>FREE</strong> shipping!`
      : `You've unlocked <strong>FREE</strong> shipping!`;

    foot.innerHTML = `
      <div class="cart-ship-bar">
        <div>${shipMsg}</div>
        <div class="cart-ship-bar-track">
          <div class="cart-ship-bar-fill" style="width:${pct}%"></div>
        </div>
      </div>
      <div class="cart-subtotal-row">
        <span class="cart-subtotal-label">Subtotal</span>
        <span class="cart-subtotal-val">${Cart.fmt(subtotal, cur)}</span>
      </div>
      <a class="cart-checkout-btn" href="checkout.html">Continue to Checkout →</a>
      <a class="cart-view-cart" href="checkout.html">View full cart</a>
    `;
  }

  // ── Boot ──────────────────────────────────────────────────────────────────
  function boot() {
    injectStyles();
    injectFab();
    injectDrawer();
    renderBadge();
    renderDrawer();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  // Expose
  window.Cart = Cart;
})();
