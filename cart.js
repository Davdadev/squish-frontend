// Shared cart logic for 3Dfidgets.shop
(function(){
  const LS_KEY = 'fidgets_cart';

  function read(){ try { return JSON.parse(localStorage.getItem(LS_KEY)) || []; } catch { return []; } }
  function write(v){ localStorage.setItem(LS_KEY, JSON.stringify(v)); }
  function esc(s){ if(!s) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function currSym(c){ return {AUD:'A$',USD:'$',GBP:'£',EUR:'€',NZD:'NZ$',CAD:'C$'}[(c||'AUD').toUpperCase()] || ((c||'AUD').toUpperCase() + ' '); }
  function fmt(cents,currency){ return currSym(currency) + (Number(cents || 0) / 100).toFixed(2); }

  function getCart(){ return read(); }
  function getCartCount(){ return getCart().reduce((sum, i) => sum + Number(i.quantity || 0), 0); }
  function getCartTotal(){ return getCart().reduce((sum, i) => sum + (Number(i.price || 0) * Number(i.quantity || 0)), 0); }

  function saveCart(cart){ write(cart); updateCartBadge(); renderCartDrawer(); }

  function addToCart(item, qty){
    const amount = Math.max(1, Math.min(10, Number(qty || 1)));
    const cart = getCart();
    const hit = cart.find(i => i.priceId === item.priceId);
    if (hit) {
      hit.quantity = Math.max(1, Math.min(10, Number(hit.quantity || 1) + amount));
    } else {
      cart.push({
        priceId: item.priceId,
        name: item.name,
        price: Number(item.price || 0),
        currency: (item.currency || 'AUD').toUpperCase(),
        image: item.image || '',
        quantity: amount,
      });
    }
    saveCart(cart);
    animateBadge();
    toast(`${item.name || 'Item'} added to cart`);
  }

  function removeFromCart(priceId){ saveCart(getCart().filter(i => i.priceId !== priceId)); }

  function updateQty(priceId, delta){
    const cart = getCart();
    const item = cart.find(i => i.priceId === priceId);
    if (!item) return;
    item.quantity = Math.max(1, Math.min(10, Number(item.quantity || 1) + Number(delta || 0)));
    saveCart(cart);
  }

  function clearCart(){ saveCart([]); }

  function updateCartBadge(){
    const btn = document.querySelector('.header-cart-btn');
    if (!btn) return;
    btn.textContent = `🛒 Cart (${getCartCount()})`;
  }

  function animateBadge(){
    const btn = document.querySelector('.header-cart-btn');
    if (!btn || !btn.animate) return;
    btn.animate([{transform:'scale(1)'},{transform:'scale(1.15)'},{transform:'scale(1)'}], {duration:320});
  }

  function openCart(){
    const overlay = document.getElementById('cartOverlay');
    const drawer = document.getElementById('cartDrawer');
    if (!overlay || !drawer) return;
    overlay.style.display = 'block';
    requestAnimationFrame(() => {
      overlay.style.opacity = '1';
      drawer.style.transform = 'translateX(0)';
    });
    document.body.style.overflow = 'hidden';
    renderCartDrawer();
  }

  function closeCart(){
    const overlay = document.getElementById('cartOverlay');
    const drawer = document.getElementById('cartDrawer');
    if (!overlay || !drawer) return;
    overlay.style.opacity = '0';
    drawer.style.transform = 'translateX(110%)';
    setTimeout(() => { overlay.style.display = 'none'; }, 220);
    document.body.style.overflow = '';
  }

  function renderCartDrawer(){
    const drawer = document.getElementById('cartDrawer');
    if (!drawer) return;
    const itemsWrap = drawer.querySelector('.cart-items');
    const footer = drawer.querySelector('.cart-footer');
    const subtotal = drawer.querySelector('.cart-subtotal');
    if (!itemsWrap || !footer || !subtotal) return;

    const cart = getCart();
    if (!cart.length) {
      itemsWrap.innerHTML = '<div class="empty-state" style="padding:2rem"><div class="big-emoji">🛒</div><h3>Your cart is empty</h3><p>Start shopping for fidgets!</p></div>';
      footer.style.display = 'none';
      return;
    }

    itemsWrap.innerHTML = cart.map(item => {
      const thumb = item.image
        ? `<img src="${esc(item.image)}" alt="${esc(item.name)}" style="width:40px;height:40px;object-fit:cover;border-radius:8px;border:2px solid var(--dark)"/>`
        : '<div style="width:40px;height:40px;border-radius:8px;border:2px solid var(--dark);display:flex;align-items:center;justify-content:center;background:#f2f2f2">🎲</div>';
      return `<div class="cart-row" data-priceid="${esc(item.priceId)}" style="display:flex;align-items:center;gap:.6rem;padding:.8rem 0;border-bottom:1px dashed rgba(26,26,46,.2)">
        <div style="flex:0 0 40px">${thumb}</div>
        <div style="flex:1;min-width:0">
          <div style="font-family:'Fredoka One',cursive;font-size:.9rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(item.name)}</div>
          <div style="font-family:'Lilita One',cursive">${fmt(item.price,item.currency)}</div>
        </div>
        <div style="display:flex;align-items:center;gap:.35rem">
          <button class="cart-qty-btn" data-action="dec" style="border:2px solid var(--dark);border-radius:100px;padding:.2rem .55rem;background:#fff">−</button>
          <span style="min-width:16px;text-align:center">${Number(item.quantity || 1)}</span>
          <button class="cart-qty-btn" data-action="inc" style="border:2px solid var(--dark);border-radius:100px;padding:.2rem .55rem;background:#fff">+</button>
        </div>
        <button class="cart-remove" title="Remove" style="border:0;background:transparent;color:var(--pink);font-size:1.15rem">✕</button>
      </div>`;
    }).join('');

    footer.style.display = 'block';
    subtotal.textContent = fmt(getCartTotal(), 'AUD');
  }

  function checkoutFromDrawer(){
    const items = encodeURIComponent(JSON.stringify(getCart()));
    location.href = `checkout.html?items=${items}`;
  }

  function toast(msg){
    if (typeof window.showToast === 'function') return window.showToast(msg);
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 3000);
  }

  document.addEventListener('click', function(e){
    const cartBtn = e.target.closest('.header-cart-btn');
    if (cartBtn) { e.preventDefault(); openCart(); return; }

    if (e.target.id === 'cartOverlay' || e.target.closest('.close-cart')) { closeCart(); return; }

    if (e.target.closest('.cart-checkout-btn')) { checkoutFromDrawer(); return; }

    if (e.target.closest('.cart-remove')) {
      const row = e.target.closest('.cart-row');
      if (!row) return;
      removeFromCart(row.getAttribute('data-priceid'));
      return;
    }

    const qtyBtn = e.target.closest('.cart-qty-btn');
    if (qtyBtn) {
      const row = e.target.closest('.cart-row');
      if (!row) return;
      const delta = qtyBtn.getAttribute('data-action') === 'inc' ? 1 : -1;
      updateQty(row.getAttribute('data-priceid'), delta);
      return;
    }
  });

  document.addEventListener('DOMContentLoaded', function(){
    updateCartBadge();
    renderCartDrawer();
  });

  window.cart = {
    getCart,
    addToCart,
    removeFromCart,
    updateQty,
    clearCart,
    getCartCount,
    getCartTotal,
    openCart,
    closeCart,
    updateCartBadge,
    renderCartDrawer,
    checkoutFromDrawer,
  };
})();
