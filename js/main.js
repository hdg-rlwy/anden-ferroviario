(() => {
  const carousel = document.querySelector('.carousel');
  const slides = [...carousel.querySelectorAll('.slide')];
  const indicators = carousel.querySelector('.carousel-indicators');
  // Mantener un indicador por fotografía, incluso cuando se agreguen más al HTML.
  indicators.replaceChildren(...slides.map((_, i) => {
    const button = document.createElement('button');
    button.className = i === 0 ? 'indicator is-active' : 'indicator';
    button.type = 'button';
    button.setAttribute('aria-label', `Mostrar fotografía ${i + 1}`);
    if (i === 0) button.setAttribute('aria-current', 'true');
    return button;
  }));
  const dots = [...indicators.querySelectorAll('.indicator')];
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let current = 0;
  let timer;
  let touchStart = null;

  function show(index) {
    current = (index + slides.length) % slides.length;
    slides[current].querySelector('img').loading = 'eager';
    slides[(current + 1) % slides.length].querySelector('img').loading = 'eager';
    slides.forEach((slide, i) => {
      slide.classList.toggle('is-active', i === current);
      slide.setAttribute('aria-hidden', String(i !== current));
      dots[i].classList.toggle('is-active', i === current);
      if (i === current) dots[i].setAttribute('aria-current', 'true');
      else dots[i].removeAttribute('aria-current');
    });
  }
  function start() {
    clearInterval(timer);
    if (!reduceMotion.matches && !document.hidden) timer = setInterval(() => show(current + 1), 6000);
  }
  carousel.querySelectorAll('[data-dir]').forEach(button => button.addEventListener('click', () => {
    show(current + Number(button.dataset.dir)); start();
  }));
  dots.forEach((dot, i) => dot.addEventListener('click', () => { show(i); start(); }));
  carousel.addEventListener('keydown', event => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault(); show(current + (event.key === 'ArrowRight' ? 1 : -1)); start();
    }
  });
  carousel.addEventListener('touchstart', event => { touchStart = event.changedTouches[0].screenX; }, {passive:true});
  carousel.addEventListener('touchend', event => {
    if (touchStart === null) return;
    const delta = event.changedTouches[0].screenX - touchStart;
    if (Math.abs(delta) > 45) { show(current + (delta < 0 ? 1 : -1)); start(); }
    touchStart = null;
  }, {passive:true});
  carousel.addEventListener('mouseenter', () => clearInterval(timer));
  carousel.addEventListener('mouseleave', start);
  carousel.addEventListener('focusin', () => clearInterval(timer));
  carousel.addEventListener('focusout', event => { if (!carousel.contains(event.relatedTarget)) start(); });
  document.addEventListener('visibilitychange', start);
  reduceMotion.addEventListener('change', start);
  start();
})();

(() => {
  const dialog = document.querySelector('#contact-dialog');
  document.querySelector('[data-contact-open]').addEventListener('click', () => dialog.showModal());
  dialog.querySelector('[data-contact-close]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
})();
