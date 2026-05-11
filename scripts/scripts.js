import {
  buildBlock,
  loadHeader,
  loadFooter,
  decorateIcons,
  decorateSections,
  decorateBlocks,
  decorateTemplateAndTheme,
  waitForFirstImage,
  loadSection,
  loadSections,
  loadCSS,
} from './aem.js';

/**
 * Builds hero block and prepends to main in a new section.
 * @param {Element} main The container element
 */
function buildHeroBlock(main) {
  const h1 = main.querySelector('h1');
  const picture = main.querySelector('picture');
  // eslint-disable-next-line no-bitwise
  if (h1 && picture && (h1.compareDocumentPosition(picture) & Node.DOCUMENT_POSITION_PRECEDING)) {
    // Check if h1 or picture is already inside a hero block
    if (h1.closest('.hero') || picture.closest('.hero')) {
      return; // Don't create a duplicate hero block
    }
    const section = document.createElement('div');
    section.append(buildBlock('hero', { elems: [picture, h1] }));
    main.prepend(section);
  }
}

/**
 * load fonts.css and set a session storage flag
 */
async function loadFonts() {
  await loadCSS(`${window.hlx.codeBasePath}/styles/fonts.css`);
  try {
    if (!window.location.hostname.includes('localhost')) sessionStorage.setItem('fonts-loaded', 'true');
  } catch (e) {
    // do nothing
  }
}

/**
 * Builds all synthetic blocks in a container element.
 * @param {Element} main The container element
 */
function buildAutoBlocks(main) {
  try {
    // auto load `*/fragments/*` references
    const fragments = [...main.querySelectorAll('a[href*="/fragments/"]')].filter((f) => !f.closest('.fragment'));
    if (fragments.length > 0) {
      // eslint-disable-next-line import/no-cycle
      import('../blocks/fragment/fragment.js').then(({ loadFragment }) => {
        fragments.forEach(async (fragment) => {
          try {
            const { pathname } = new URL(fragment.href);
            const frag = await loadFragment(pathname);
            fragment.parentElement.replaceWith(...frag.children);
          } catch (error) {
            // eslint-disable-next-line no-console
            console.error('Fragment loading failed', error);
          }
        });
      });
    }

    buildHeroBlock(main);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Auto Blocking failed', error);
  }
}

/**
 * Decorates formatted links to style them as buttons.
 * @param {HTMLElement} main The main container element
 */
function decorateButtons(main) {
  main.querySelectorAll('p a[href]').forEach((a) => {
    a.title = a.title || a.textContent;
    const p = a.closest('p');
    const text = a.textContent.trim();

    // quick structural checks
    if (a.querySelector('img') || p.textContent.trim() !== text) return;

    // skip URL display links
    try {
      if (new URL(a.href).href === new URL(text, window.location).href) return;
    } catch { /* continue */ }

    // require authored formatting for buttonization
    const strong = a.closest('strong');
    const em = a.closest('em');
    if (!strong && !em) return;

    p.className = 'button-wrapper';
    a.className = 'button';
    if (strong && em) { // high-impact call-to-action
      a.classList.add('accent');
      const outer = strong.contains(em) ? strong : em;
      outer.replaceWith(a);
    } else if (strong) {
      a.classList.add('primary');
      strong.replaceWith(a);
    } else {
      a.classList.add('secondary');
      em.replaceWith(a);
    }
  });
}

function initializeSliders(main) {
  main.querySelectorAll('[data-slider]').forEach((slider) => {
    const slides = [...slider.querySelectorAll('.landing-slide')];
    if (slides.length < 2) return;

    const syncVisualSel = slider.getAttribute('data-slider-sync-visual');
    const syncRoot = syncVisualSel ? document.querySelector(syncVisualSel) : null;
    const syncItems = syncRoot
      ? [...syncRoot.querySelectorAll('[data-slide-for]')]
      : [];

    let activeIndex = 0;
    let dots = [];

    const syncDots = () => {
      dots.forEach((dot, i) => {
        const on = i === activeIndex;
        dot.classList.toggle('is-active', on);
        dot.setAttribute('aria-selected', on ? 'true' : 'false');
        dot.tabIndex = on ? 0 : -1;
      });
    };

    const syncVisual = () => {
      const key = slides[activeIndex].dataset.slideIndex ?? String(activeIndex);
      syncItems.forEach((el) => {
        el.classList.toggle('is-active', el.dataset.slideFor === key);
      });
    };

    const showSlide = (index) => {
      slides[activeIndex].classList.remove('active');
      activeIndex = (index + slides.length) % slides.length;
      slides[activeIndex].classList.add('active');
      syncDots();
      syncVisual();
    };

    const nav = document.createElement('div');
    nav.className = 'landing-slider-nav';
    nav.setAttribute('role', 'tablist');
    nav.setAttribute('aria-label', 'Slides');

    dots = slides.map((_, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'landing-slider-dot';
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', i === 0 ? 'true' : 'false');
      btn.setAttribute('aria-label', `Show slide ${i + 1} of ${slides.length}`);
      if (i === 0) btn.classList.add('is-active');
      btn.addEventListener('click', () => showSlide(i));
      nav.append(btn);
      return btn;
    });

    slider.append(nav);
    syncDots();
    syncVisual();

    window.setInterval(() => {
      showSlide(activeIndex + 1);
    }, 4500);
  });
}

/**
 * Pointer tilt for hero visual stack (skipped when reduced motion preferred).
 * @param {Element} root Element with [data-hero-tilt]
 */
function initHeroVisualTilt(root) {
  try {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const floats = [...root.querySelectorAll('.landing-hero-float')];
    if (!floats.length) return;

    const damp = (n, max) => Math.max(-max, Math.min(max, n));

    const onMove = (/** @type {PointerEvent} */ e) => {
      const r = root.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      floats.forEach((el, i) => {
        const f = (i + 1) * 0.9;
        el.style.setProperty('--tilt-x', `${damp(px * 18 * f, 24)}deg`);
        el.style.setProperty('--tilt-y', `${damp(-py * 14 * f, 18)}deg`);
        el.style.setProperty('--parallax-x', `${damp(px * 14 * f, 20)}px`);
        el.style.setProperty('--parallax-y', `${damp(py * 12 * f, 16)}px`);
      });
    };

    const reset = () => {
      floats.forEach((el) => {
        el.style.setProperty('--tilt-x', '0deg');
        el.style.setProperty('--tilt-y', '0deg');
        el.style.setProperty('--parallax-x', '0px');
        el.style.setProperty('--parallax-y', '0px');
      });
    };

    root.addEventListener('pointermove', onMove);
    root.addEventListener('pointerleave', reset);
    root.addEventListener('pointercancel', reset);
  } catch {
    /* non-fatal */
  }
}

/** Stagger fade-in for grid/bento children marked by [data-stagger] */
function initializeStaggeredEntrance(main) {
  const parents = [...main.querySelectorAll('[data-stagger]')];
  if (!parents.length) return;

  if (!('IntersectionObserver' in window)) {
    parents.forEach((p) => {
      [...p.children].forEach((child) => child.classList.add('is-stagger-visible'));
    });
    return;
  }

  const observer = new IntersectionObserver((entries, obs) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const { target } = entry;
      [...target.children].forEach((child, i) => {
        window.setTimeout(() => child.classList.add('is-stagger-visible'), 60 * i);
      });
      obs.unobserve(target);
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -5% 0px' });

  parents.forEach((p) => observer.observe(p));
}

function initializeLandingHeaderEnhancements() {
  const header = document.querySelector('.landing-header');
  if (!header) return;

  const onScroll = () => {
    const y = window.scrollY || document.documentElement.scrollTop;
    header.classList.toggle('landing-header-scrolled', y > 12);
  };

  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
}

function initializeLandingMotion(main) {
  const heroVisual = main.querySelector('[data-hero-tilt]');
  if (heroVisual) initHeroVisualTilt(heroVisual);
  initializeStaggeredEntrance(main);
}

function initializeFadeIn(main) {
  const sections = [...main.querySelectorAll('.landing-section')];
  if (!sections.length) return;

  if (!('IntersectionObserver' in window)) {
    sections.forEach((section) => section.classList.add('is-visible'));
    return;
  }

  const observer = new IntersectionObserver((entries, instance) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        instance.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });

  sections.forEach((section) => observer.observe(section));
}

/**
 * Decorates the main element.
 * @param {Element} main The main element
 */
// eslint-disable-next-line import/prefer-default-export
export function decorateMain(main) {
  decorateIcons(main);
  buildAutoBlocks(main);
  decorateSections(main);
  decorateBlocks(main);
  decorateButtons(main);
  initializeSliders(main);
  initializeFadeIn(main);
  initializeLandingMotion(main);
  initializeLandingHeaderEnhancements();
}

/**
 * Loads everything needed to get to LCP.
 * @param {Element} doc The container element
 */
async function loadEager(doc) {
  document.documentElement.lang = 'en';
  decorateTemplateAndTheme();
  const main = doc.querySelector('main');
  if (main) {
    decorateMain(main);
    document.body.classList.add('appear');
    await loadSection(main.querySelector('.section'), waitForFirstImage);
  }

  try {
    /* if desktop (proxy for fast connection) or fonts already loaded, load fonts.css */
    if (window.innerWidth >= 900 || sessionStorage.getItem('fonts-loaded')) {
      loadFonts();
    }
  } catch (e) {
    // do nothing
  }
}

/**
 * Loads everything that doesn't need to be delayed.
 * @param {Element} doc The container element
 */
async function loadLazy(doc) {
  loadHeader(doc.querySelector('header'));

  const main = doc.querySelector('main');
  await loadSections(main);

  const { hash } = window.location;
  const element = hash ? doc.getElementById(hash.substring(1)) : false;
  if (hash && element) element.scrollIntoView();

  loadFooter(doc.querySelector('footer'));

  loadCSS(`${window.hlx.codeBasePath}/styles/lazy-styles.css`);
  loadFonts();
}

/**
 * Loads everything that happens a lot later,
 * without impacting the user experience.
 */
function loadDelayed() {
  // eslint-disable-next-line import/no-cycle
  window.setTimeout(() => import('./delayed.js'), 3000);
  // load anything that can be postponed to the latest here
}

async function loadPage() {
  await loadEager(document);
  await loadLazy(document);
  loadDelayed();
}

loadPage();
