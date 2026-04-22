// cart.js - shared cart logic for 3Dfidgets.shop

// --- Cart Data Management ---
function getCart() {
  try {
    return JSON.parse(localStorage.getItem('cart')||'[]');
  } catch { return []; }
}
function setCart(cart) {
  localStorage.setItem('cart', JSON.stringify(cart));
  updateCartCount();
}
function addToCart(product, qty=1) {
  const cart = getCart();
  const idx = cart.findIndex(item => item.priceId === product.priceId);
  if (idx > -1) {
    cart[idx].qty += qty;
  } else {
    cart.push({ priceId: product.priceId, name: product.name, price: product.price, image: product.image, qty, currency: product.currency });
  }
  setCart(cart);
  showCartToast('Added to cart!');
}
function removeFromCart(priceId) {
  let cart = getCart();
  cart = cart.filter(item => item.priceId !== priceId);
  setCart(cart);
}
function updateCartQty(priceId, qty) {
  const cart = getCart();
  const idx = cart.findIndex(item => item.priceId === priceId);
  if (idx > -1) {
    cart[idx].qty = Math.max(1, qty);
    setCart(cart);
  }
}
function clearCart() {
  setCart([]);
}
function updateCartCount() {
  const cart = getCart();
  const count = cart.reduce((sum, item) => sum + item.qty, 0);
  const el = document.getElementById('cart-count');
  if (el) el.textContent = count;
}
function showCartToast(msg) {
  let t = document.getElementById('cart-toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'cart-toast';
    t.style.position = 'fixed';
    t.style.bottom = '2rem';
    t.style.left = '50%';
    t.style.transform = 'translateX(-50%)';
    t.style.background = '#1a1a2e';
    t.style.color = '#FF4D8D';
    t.style.fontFamily = "'Fredoka One',cursive";
    t.style.fontSize = '1rem';
    t.style.padding = '.8rem 1.8rem';
    t.style.borderRadius = '100px';
    t.style.border = '2.5px solid #FF4D8D';
    t.style.boxShadow = '4px 4px 0 #FF4D8D';
    t.style.zIndex = 1000;
    t.style.pointerEvents = 'none';
    t.style.whiteSpace = 'nowrap';
    t.style.transition = 'opacity .3s';
    t.style.opacity = 0;
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.opacity = 1;
  setTimeout(()=>{ t.style.opacity = 0; }, 2500);
}
// --- Cart Page Rendering ---
function renderCartPage(productsMap) {
  const cart = getCart();
  const list = document.getElementById('cartList');
  const totalEl = document.getElementById('cartTotal');
  const emptyEl = document.getElementById('emptyCart');
  if (!list || !totalEl || !emptyEl) return;
  if (!cart.length) {
    list.innerHTML = '';
    totalEl.textContent = '';
    emptyEl.style.display = '';
    return;
  }
  emptyEl.style.display = 'none';
  let total = 0;
  list.innerHTML = cart.map(item => {
    const price = (item.price/100).toFixed(2);
    const sym = currSym((item.currency||'aud').toUpperCase());
    total += item.price * item.qty;
    return `<li class="cart-item">
      <img class="cart-item-img" src="${item.image||''}" alt="${item.name||''}">
      <div class="cart-item-info">
        <div class="cart-item-title">${item.name||''}</div>
        <div class="cart-item-price">${sym}${price}</div>
      </div>
      <div class="cart-item-controls">
        <button class="qty-btn" onclick="updateCartQty('${item.priceId}',${item.qty-1});renderCartPage()">-</button>
        <span>${item.qty}</span>
        <button class="qty-btn" onclick="updateCartQty('${item.priceId}',${item.qty+1});renderCartPage()">+</button>
        <button class="remove-btn" onclick="removeFromCart('${item.priceId}');renderCartPage()">Remove</button>
      </div>
    </li>`;
  }).join('');
  totalEl.textContent = 'Total: ' + currSym((cart[0]?.currency||'aud').toUpperCase()) + (total/100).toFixed(2);
}
function currSym(c){return{AUD:'A$',USD:'$',GBP:'£',EUR:'€',NZD:'NZ$',CAD:'C$'}[c]||c+' ';}
// --- Cart Icon Click ---
function goToCartPage() {
  window.location.href = 'cart.html';
}
// --- On Load ---
document.addEventListener('DOMContentLoaded', updateCartCount);
