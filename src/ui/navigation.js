export function closeMobileNavigation(documentRef, windowRef = globalThis) {
  if (!windowRef || !windowRef.innerWidth || windowRef.innerWidth > 1100) return false;
  const body = documentRef.body;
  if (!body.classList.contains('menu-open')) return false;
  body.classList.remove('menu-open');
  const button = documentRef.getElementById('menuToggleButton');
  button?.setAttribute('aria-expanded', 'false');
  button?.setAttribute('aria-label', 'Abrir menu de navegação');
  return true;
}
