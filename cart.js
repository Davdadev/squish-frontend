// Shared cart logic for 3Dfidgets.shop
(function(){
  const LS_KEY = 'fidgets_cart';
  function read(){try{return JSON.parse(localStorage.getItem(LS_KEY))||[]}catch{return []}}
  function write(v){localStorage.setItem(LS_KEY,JSON.stringify(v));}
  function getCart(){return read()}
  function saveCart(c){write(c);renderCartBadge(); renderCartDrawer();}
  function getCartCount(){return getCart().reduce((s,i)=>s+(i.quantity||0),0)}
  function getCartTotal(){return getCart().reduce((s,i)=>(s + (Number(i.price||0) * (i.quantity||0))),0)}
  function formatCurrency(cents,curr){curr = (curr||'AUD').toUpperCase(); const sym={AUD:'A$',USD:'$',GBP:'£',EUR:'€'}[curr]||curr+' '; return `${sym}${(Number(cents||0)/100).toFixed(2)}`}

  function addToCart(item, qty=1){
    const cart = getCart();
    const existing = cart.find(i=>i.priceId===item.priceId);
    if(existing){ existing.quantity = Math.min(10,(existing.quantity||0)+qty); }
    else { cart.push(Object.assign({quantity:qty}, item)); }
    saveCart(cart);
    animateCartBadge();
    showToast(`${item.name} added to cart`);
  }

  function removeFromCart(priceId){
    const cart = getCart().filter(i=>i.priceId!==priceId);
    saveCart(cart);
  }

  function updateQty(priceId, delta){
    const cart = getCart();
    const it = cart.find(i=>i.priceId===priceId); if(!it) return;
    it.quantity = Math.max(1, Math.min(10, (it.quantity||1) + delta));
    saveCart(cart);
  }

  function clearCart(){ saveCart([]); }

  // DOM helpers and rendering
  function renderCartBadge(){
    const btn = document.querySelector('.header-cart-btn');
    if(!btn) return;
    const count = getCartCount();
    btn.innerHTML = `🛒 Cart (${count})`;
    if(count===0) btn.classList.remove('has-items'); else btn.classList.add('has-items');
  }

  function animateCartBadge(){
    const btn = document.querySelector('.header-cart-btn');
    if(!btn) return; btn.animate([{transform:'scale(1)'},{transform:'scale(1.18)'},{transform:'scale(1)'}],{duration:350});
  }

  function renderCartDrawer(){
    const drawer = document.getElementById('cartDrawer');
    const overlay = document.getElementById('cartOverlay');
    if(!drawer || !overlay) return;
    const cart = getCart();
    if(cart.length===0){ drawer.querySelector('.cart-items').innerHTML = `<div class="empty-state" style="padding:2rem"><div class="big-emoji">🛒</div><h3>Your cart is empty</h3><p>Start shopping for fidgets!</p></div>`; drawer.querySelector('.cart-footer').style.display='none'; return; }
    const itemsHtml = cart.map(i=>{
      const img = i.image?`<img src="${i.image}" alt="${escapeHtml(i.name)}" style="width:40px;height:40px;object-fit:cover;border-radius:8px;border:2px solid var(--dark)"/>`:`<div style="width:40px;height:40px;border-radius:8px;background:#f0f0f0;display:flex;align-items:center;justify-content:center;border:2px solid var(--dark)">${escapeHtml(i.emoji||'🔹')}</div>`;
      return `<div class="cart-row" data-priceid="${escapeHtml(i.priceId)}" style="display:flex;align-items:center;gap:.6rem;padding:.7rem 0;border-bottom:1px dashed rgba(26,26,46,.08)">
        <div style="flex:0 0 40px">${img}</div>
        <div style="flex:1">
          <div style="font-family:'Fredoka One',cursive">${escapeHtml(i.name)}</div>
          <div style="font-family:'Lilita One',cursive;color:var(--dark)">${formatCurrency(i.price,i.currency)}</div>
        </div>
        <div style="display:flex;gap:.4rem;align-items:center">
          <button class="cart-qty-btn" data-action="dec" style="border:2.5px solid var(--dark);background:#fff;border-radius:100px;padding:.25rem .6rem">−</button>
          <div style="min-width:26px;text-align:center">${i.quantity}</div>
          <button class="cart-qty-btn" data-action="inc" style="border:2.5px solid var(--dark);background:#fff;border-radius:100px;padding:.25rem .6rem">+</button>
        </div>
        <button class="cart-remove" title="Remove" style="background:transparent;border:0;color:var(--pink);font-size:1.1rem;margin-left:.6rem">✕</button>
      </div>`;
    }).join('');
    drawer.querySelector('.cart-items').innerHTML = itemsHtml;
    drawer.querySelector('.cart-footer').style.display='block';
    drawer.querySelector('.cart-subtotal').textContent = formatCurrency(getCartTotal(),'AUD');
  }

  function openCart(){ document.getElementById('cartOverlay').classList.add('open'); document.getElementById('cartDrawer').classList.add('open'); document.body.style.overflow='hidden'; renderCartDrawer(); }
  function closeCart(){ document.getElementById('cartOverlay').classList.remove('open'); document.getElementById('cartDrawer').classList.remove('open'); document.body.style.overflow=''; }

  function escapeHtml(s){ if(!s) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  // Toast helper uses page's showToast if present, otherwise simple fallback
  function showToast(msg){ if(window.showToast) return window.showToast(msg); const t=document.getElementById('toast'); if(!t) return; t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),3000); }

  // Event delegation
  document.addEventListener('click', function(e){
    if(e.target.matches('.header-cart-btn') || e.target.closest('.header-cart-btn')){ e.preventDefault(); openCart(); }
    if(e.target.matches('#cartOverlay') || e.target.closest('#cartOverlay .close-cart')){ closeCart(); }
    if(e.target.matches('.cart-remove')){ const row=e.target.closest('.cart-row'); if(!row) return; const id=row.getAttribute('data-priceid'); removeFromCart(id); renderCartDrawer(); }
    if(e.target.matches('.cart-qty-btn')){ const row=e.target.closest('.cart-row'); if(!row) return; const id=row.getAttribute('data-priceid'); const action=e.target.getAttribute('data-action'); updateQty(id, action==='inc'?1:-1); renderCartDrawer(); }
    if(e.target.matches('[data-add-to-cart]')){ e.preventDefault(); const pid=e.target.getAttribute('data-priceid'); const name=e.target.getAttribute('data-name')||'Fidget'; const price=Number(e.target.getAttribute('data-price')||0); const curr=e.target.getAttribute('data-currency')||'AUD'; const image=e.target.getAttribute('data-image')||''; addToCart({priceId:pid,name:name,price:price,currency:curr,image:image},1); }
  });

  // on load
  document.addEventListener('DOMContentLoaded', function(){ renderCartBadge(); renderCartDrawer();
    // wire any inline add-to-cart buy buttons present in products
    document.querySelectorAll('.buy-btn').forEach(b=>{
      b.addEventListener('click', function(ev){ ev.stopPropagation(); const pPriceId = b.getAttribute('data-priceid'); if(pPriceId){ const productEl = b.closest('.product-card'); const name = productEl?.querySelector('.card-name')?.textContent || 'Fidget'; const priceText = productEl?.querySelector('.card-price')?.textContent || '0'; const price = Number((b.getAttribute('data-price-cents'))||0); const curr = b.getAttribute('data-currency')||'AUD'; const img = productEl?.querySelector('.card-image-wrap img')?.src||''; addToCart({priceId:pPriceId,name:name,price:price,currency:curr,image:img},1); }
    });
    });
  });

  // expose API
  window.cart = { getCart, addToCart, removeFromCart, updateQty, clearCart, getCartCount, getCartTotal, openCart, closeCart };
})();
