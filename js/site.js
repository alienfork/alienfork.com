document.addEventListener('DOMContentLoaded', () => {
    const y = document.getElementById('year');
    if (y) y.textContent = new Date().getFullYear();
});

// mobile menu toggle + footer year
// Toggle menu (works for injected content)
document.addEventListener('click', (e) => {
    const btn = e.target.closest('.menu-toggle');
    if (!btn) return;
    const navWrap = btn.closest('.nav');
    if (!navWrap) return;
    const open = navWrap.classList.toggle('open');
    btn.setAttribute('aria-expanded', String(open));
});

// Close menu when a link is tapped
document.addEventListener('click', (e) => {
    const link = e.target.closest('.nav nav a');
    if (!link) return;
    const navWrap = link.closest('.nav');
    const btn = navWrap?.querySelector('.menu-toggle');
    navWrap?.classList.remove('open');
    if (btn) btn.setAttribute('aria-expanded', 'false');
});
