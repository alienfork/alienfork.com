document.addEventListener('DOMContentLoaded', async () => {
  const slots = document.querySelectorAll('[data-include]');
  await Promise.all([...slots].map(async el => {
    const path = el.getAttribute('data-include');
    try {
      const res = await fetch(path, {cache: 'no-store' });
    el.innerHTML = await res.text();
    } catch (e) {
        console.error('Include failed:', path, e);
    }
  }));
});
