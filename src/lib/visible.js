function computedStyle(el) {
  const view = el.ownerDocument && el.ownerDocument.defaultView;
  if (view && typeof view.getComputedStyle === 'function') return view.getComputedStyle(el);
  if (typeof getComputedStyle === 'function') return getComputedStyle(el);
  return null;
}

/**
 * True when the node is not hidden. Items below the fold still count.
 * A virtualized sidebar simply does not render those rows, so they are absent here.
 */
export function isRenderedVisible(el) {
  if (!el || el.nodeType !== 1) return false;
  let node = el;
  while (node && node.nodeType === 1) {
    if (node.hasAttribute && node.hasAttribute('hidden')) return false;
    const inline = node.style || {};
    const computed = computedStyle(node);
    const display = (computed && computed.display) || inline.display || '';
    const visibility = (computed && computed.visibility) || inline.visibility || '';
    if (display === 'none' || visibility === 'hidden' || visibility === 'collapse') return false;
    node = node.parentElement;
  }
  return true;
}
