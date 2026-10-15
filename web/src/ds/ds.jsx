/* eslint-disable */
// Design-system components extracted verbatim from the prototype bundle
// (IbrahimAlSharidiDroneVideoDesignSystem). Do not edit by hand — re-extract if the DS changes.
import React from 'react';

// ---- components/core/Badge.jsx
function Badge({
  children,
  tone = 'accent',
  style
}) {
  const tones = {
    accent: {
      background: 'var(--color-surface-strong)',
      color: 'var(--ink-700)'
    },
    dark: {
      background: 'var(--color-inverse-bg)',
      color: 'var(--color-inverse-text)'
    },
    outline: {
      background: 'transparent',
      color: 'var(--color-text)',
      border: 'var(--border-hairline)'
    },
    success: {
      background: 'var(--color-surface-strong)',
      color: 'var(--color-success)'
    },
    warning: {
      background: 'var(--color-surface-strong)',
      color: 'var(--tan-600)'
    },
    danger: {
      background: 'var(--color-surface)',
      color: 'var(--color-danger)'
    }
  };
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      fontFamily: 'var(--type-ui-font)',
      fontWeight: 600,
      fontSize: 'var(--badge-size)',
      padding: 'var(--badge-pad)',
      borderRadius: 'var(--badge-radius)',
      lineHeight: 1.4,
      whiteSpace: 'nowrap',
      ...tones[tone],
      ...style
    }
  }, children);
}

// ---- components/core/Icon.jsx
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Inline icon path data — no external sprite/CDN reference, so icons render everywhere
 * (Chromium, screenshot capture, offline). Keep in sync with assets/icons/icon-sprite.svg. */
const ICON_PATHS = {
  // ---- added in Update 1 (board menus, sign out) ----
  'log-out': "<path d=\"M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 17l-5-5 5-5M5 12h11\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\" stroke-linecap=\"round\" stroke-linejoin=\"round\"></path>",
  'more': "<circle cx=\"5.5\" cy=\"12\" r=\"1.7\" fill=\"currentColor\"></circle><circle cx=\"12\" cy=\"12\" r=\"1.7\" fill=\"currentColor\"></circle><circle cx=\"18.5\" cy=\"12\" r=\"1.7\" fill=\"currentColor\"></circle>",
  'unlock': "<rect x=\"5\" y=\"10.5\" width=\"14\" height=\"10\" rx=\"2\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\"></rect><path d=\"M8 10.5V8a4 4 0 0 1 7.6-1.7\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\" stroke-linecap=\"round\"></path>",
  'copy': "<rect x=\"8\" y=\"8\" width=\"12\" height=\"12\" rx=\"2\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\"></rect><path d=\"M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\"></path>",
  'scissors': "<circle cx=\"6\" cy=\"7\" r=\"2.5\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\"></circle><circle cx=\"6\" cy=\"17\" r=\"2.5\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\"></circle><path d=\"M8 8.5 20 18M8 15.5 20 6\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\" stroke-linecap=\"round\"></path>",
  'clipboard': "<rect x=\"5\" y=\"5\" width=\"14\" height=\"16\" rx=\"2\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\"></rect><path d=\"M9 5V3.5h6V5\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\" stroke-linejoin=\"round\"></path>",
  'layers': "<path d=\"M12 4 3 9l9 5 9-5-9-5Z\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\" stroke-linejoin=\"round\"></path><path d=\"m3 14 9 5 9-5\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\" stroke-linejoin=\"round\"></path>",
  'frame': "<rect x=\"3.5\" y=\"5.5\" width=\"17\" height=\"13\" rx=\"2.5\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\" stroke-dasharray=\"3 2.2\"></rect>",
  'heading': "<path d=\"M6 5v14M18 5v14M6 12h12\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.9\" stroke-linecap=\"round\"></path>",
  'maximize': "<path d=\"M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\" stroke-linecap=\"round\" stroke-linejoin=\"round\"></path>",
  'grid': "<rect x=\"4\" y=\"4\" width=\"6.5\" height=\"6.5\" rx=\"1.2\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\"></rect><rect x=\"13.5\" y=\"4\" width=\"6.5\" height=\"6.5\" rx=\"1.2\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\"></rect><rect x=\"4\" y=\"13.5\" width=\"6.5\" height=\"6.5\" rx=\"1.2\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\"></rect><rect x=\"13.5\" y=\"13.5\" width=\"6.5\" height=\"6.5\" rx=\"1.2\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\"></rect>",
  'align-h': "<path d=\"M12 3v18M7 7h10M5 14h14\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\" stroke-linecap=\"round\"></path>",
  'distribute': "<path d=\"M4 4v16M20 4v16\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\" stroke-linecap=\"round\"></path><rect x=\"9.5\" y=\"7\" width=\"5\" height=\"10\" rx=\"1\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\"></rect>",
  'width': "<path d=\"M4 12h16M7 9l-3 3 3 3M17 9l3 3-3 3M4 5v14M20 5v14\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\"></path>",
  'droplet': "<path d=\"M12 3.5c3.5 4.2 6 7.4 6 10.5a6 6 0 0 1-12 0c0-3.1 2.5-6.3 6-10.5Z\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\" stroke-linejoin=\"round\"></path>",
  'arrow-up-right': "<path d=\"M7 17 17 7M9 7h8v8\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\" stroke-linecap=\"round\" stroke-linejoin=\"round\"></path>",
  'aperture': "<circle cx=\"12\" cy=\"12\" r=\"9\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\"></circle><path d=\"M12 3v6M12 15v6M4.2 7.5l5.2 3M14.6 13.5l5.2 3M4.2 16.5l5.2-3M14.6 10.5l5.2-3\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\"></path>",
  'arrow-left': "<path d=\"M20 12H4M10 6l-6 6 6 6\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\" stroke-linecap=\"round\" stroke-linejoin=\"round\"></path>",
  'arrow-right': "<path d=\"M4 12h16M14 6l6 6-6 6\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\" stroke-linecap=\"round\" stroke-linejoin=\"round\"></path>",
  'badge-check': "<path d=\"M12 3l2.3 1.4 2.7-.2 1 2.5 2.3 1.6-.9 2.6.9 2.6-2.3 1.6-1 2.5-2.7-.2L12 21l-2.3-1.6-2.7.2-1-2.5-2.3-1.6.9-2.6L3.7 10l2.3-1.6 1-2.5 2.7.2Z\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linejoin=\"round\"></path><path d=\"M8.7 12.2l2 2 4.6-4.8\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\" stroke-linecap=\"round\" stroke-linejoin=\"round\"></path>",
  'bell': "<path d=\"M12 3.5c2.5 0 4.2 2 4.2 4.5v2.5c0 1.5.5 2.7 1.3 3.6H6.5c.8-.9 1.3-2.1 1.3-3.6V8c0-2.5 1.7-4.5 4.2-4.5Z\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\" stroke-linejoin=\"round\"></path><path d=\"M10 17.5a2 2 0 0 0 4 0\" stroke=\"currentColor\" stroke-width=\"1.75\" stroke-linecap=\"round\"></path>",
  'bookmark': "<path d=\"M6 4h12v16l-6-4.2L6 20Z\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\" stroke-linejoin=\"round\"></path>",
  'calendar-check': "<rect x=\"3\" y=\"5\" width=\"18\" height=\"16\" rx=\"2\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\"></rect><path d=\"M3 10h18M8 3v4M16 3v4\" stroke=\"currentColor\" stroke-width=\"1.75\" stroke-linecap=\"round\"></path><path d=\"M8 15l2.2 2.2L16 12.5\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\" stroke-linecap=\"round\" stroke-linejoin=\"round\"></path>",
  'camera': "<path d=\"M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\" stroke-linejoin=\"round\"></path><circle cx=\"12\" cy=\"13\" r=\"3.2\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\"></circle>",
  'cart': "<path d=\"M3 4h2l2.2 11.2h10.1L19.5 8H6\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\" stroke-linejoin=\"round\"></path><circle cx=\"9\" cy=\"19.5\" r=\"1.4\" fill=\"currentColor\"></circle><circle cx=\"17\" cy=\"19.5\" r=\"1.4\" fill=\"currentColor\"></circle>",
  'check': "<path d=\"M4.5 12.5 9.5 17.5 19.5 6.5\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"></path>",
  'chevron-down': "<path d=\"M5.5 9l6.5 6.5L18.5 9\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\" stroke-linecap=\"round\" stroke-linejoin=\"round\"></path>",
  'chevron-up': "<path d=\"M5.5 15L12 8.5 18.5 15\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\" stroke-linecap=\"round\" stroke-linejoin=\"round\"></path>",
  'clock': "<circle cx=\"12\" cy=\"12\" r=\"9\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\"></circle><path d=\"M12 7v5l3.5 2\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\" stroke-linecap=\"round\" stroke-linejoin=\"round\"></path>",
  'credit-card': "<rect x=\"2.5\" y=\"5.5\" width=\"19\" height=\"13\" rx=\"2\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\"></rect><path d=\"M2.5 9.5h19\" stroke=\"currentColor\" stroke-width=\"1.75\"></path>",
  'download': "<path d=\"M12 3v12M7.5 11l4.5 4.5L16.5 11\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\" stroke-linecap=\"round\" stroke-linejoin=\"round\"></path><path d=\"M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\" stroke-linecap=\"round\"></path>",
  'drone': "<rect x=\"9\" y=\"9\" width=\"6\" height=\"6\" rx=\"1.5\" fill=\"currentColor\"></rect><path d=\"M9.5 9.5 6 6M14.5 9.5 18 6M9.5 14.5 6 18M14.5 14.5 18 18\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\"></path><circle cx=\"5\" cy=\"5\" r=\"2.6\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"></circle><circle cx=\"19\" cy=\"5\" r=\"2.6\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"></circle><circle cx=\"5\" cy=\"19\" r=\"2.6\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"></circle><circle cx=\"19\" cy=\"19\" r=\"2.6\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"></circle>",
  'edit': "<path d=\"M4 20l1-4L16 5l3 3L8 19l-4 1Z\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linejoin=\"round\"></path><path d=\"M14 7l3 3\" stroke=\"currentColor\" stroke-width=\"1.6\"></path>",
  'eye': "<path d=\"M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\" stroke-linejoin=\"round\"></path><circle cx=\"12\" cy=\"12\" r=\"2.6\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\"></circle>",
  'file': "<path d=\"M7 3.5h7l4 4V20a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linejoin=\"round\"></path><path d=\"M14 3.5V8h4\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linejoin=\"round\"></path>",
  'film': "<rect x=\"3\" y=\"4\" width=\"18\" height=\"16\" rx=\"1.5\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\"></rect><path d=\"M3 9h18M3 15h18M8 4v5M8 15v5M16 4v5M16 15v5\" stroke=\"currentColor\" stroke-width=\"1.5\"></path>",
  'folder': "<path d=\"M3.5 6.5a1.5 1.5 0 0 1 1.5-1.5h4l2 2h8a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5Z\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linejoin=\"round\"></path>",
  'globe': "<circle cx=\"12\" cy=\"12\" r=\"9\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\"></circle><path d=\"M3 12h18M12 3c2.5 2.5 3.5 6 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-6-3.5-9s1-6.5 3.5-9Z\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\"></path>",
  'heart': "<path d=\"M12 20s-7.5-4.5-9.5-9C1 7.5 3 4 6.5 4c2 0 3.3 1.2 5.5 3.5C14.2 5.2 15.5 4 17.5 4 21 4 23 7.5 21.5 11 19.5 15.5 12 20 12 20Z\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\" stroke-linejoin=\"round\"></path>",
  'home': "<path d=\"M4 11.5 12 4l8 7.5V20a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1Z\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\" stroke-linejoin=\"round\"></path>",
  'image': "<rect x=\"3\" y=\"4\" width=\"18\" height=\"16\" rx=\"2\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\"></rect><circle cx=\"8.5\" cy=\"9.5\" r=\"1.6\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\"></circle><path d=\"M4 17l5-5 4 4 3-3 4 4\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linejoin=\"round\"></path>",
  'instagram': "<rect x=\"3.5\" y=\"3.5\" width=\"17\" height=\"17\" rx=\"4.5\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\"></rect><circle cx=\"12\" cy=\"12\" r=\"4\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\"></circle><circle cx=\"17\" cy=\"7\" r=\"1.1\" fill=\"currentColor\"></circle>",
  'link': "<path d=\"M9.5 14.5 14.5 9.5M8 13 5.5 15.5a3 3 0 0 0 4.2 4.2L12.5 17M16 11l2.5-2.5a3 3 0 0 0-4.2-4.2L11.5 7\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\" stroke-linecap=\"round\" stroke-linejoin=\"round\"></path>",
  'lock': "<rect x=\"5\" y=\"10.5\" width=\"14\" height=\"10\" rx=\"2\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\"></rect><path d=\"M8 10.5V8a4 4 0 0 1 8 0v2.5\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\"></path>",
  'mail': "<rect x=\"3\" y=\"5\" width=\"18\" height=\"14\" rx=\"2\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\"></rect><path d=\"M4 6.5 12 13l8-6.5\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\" stroke-linecap=\"round\" stroke-linejoin=\"round\"></path>",
  'map-pin': "<path d=\"M12 21s7-6.5 7-11.5A7 7 0 0 0 5 9.5C5 14.5 12 21 12 21Z\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\" stroke-linejoin=\"round\"></path><circle cx=\"12\" cy=\"9.5\" r=\"2.4\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\"></circle>",
  'message-circle': "<path d=\"M12 4C6.5 4 3 7.5 3 11.5c0 2 .8 3.7 2.2 5L4 21l4.4-1.3c1 .5 2.3.8 3.6.8 5.5 0 9-3.5 9-7.5S17.5 4 12 4Z\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\" stroke-linejoin=\"round\"></path>",
  'mic': "<rect x=\"9\" y=\"3\" width=\"6\" height=\"11\" rx=\"3\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\"></rect><path d=\"M6 11a6 6 0 0 0 12 0M12 17v3M9 20h6\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\" stroke-linecap=\"round\"></path>",
  'minus': "<path d=\"M5 12h14\" stroke=\"currentColor\" stroke-width=\"1.9\" stroke-linecap=\"round\"></path>",
  'music': "<path d=\"M9 18V5l10-2v13\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\" stroke-linejoin=\"round\"></path><circle cx=\"6.5\" cy=\"18\" r=\"2.5\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\"></circle><circle cx=\"16.5\" cy=\"16\" r=\"2.5\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\"></circle>",
  'palm-tree': "<path d=\"M12 21V11\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\" stroke-linecap=\"round\"></path><path d=\"M12 11c-1-3-3.5-4.5-6.5-4 1 2.5 3 4 6.5 4Z\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linejoin=\"round\"></path><path d=\"M12 11c1-3 3.5-4.5 6.5-4-1 2.5-3 4-6.5 4Z\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linejoin=\"round\"></path><path d=\"M12 11c-.5-3 .5-5.5 3-7 .5 3-.5 5.5-3 7Z\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linejoin=\"round\"></path><path d=\"M8 21h8\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\"></path>",
  'paperclip': "<path d=\"M17.5 8.5 9.9 16.1a3 3 0 1 1-4.2-4.2l8.5-8.5a4 4 0 1 1 5.7 5.7l-9.2 9.2\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\"></path>",
  'pause': "<rect x=\"7\" y=\"5.5\" width=\"4\" height=\"13\" rx=\"1\" fill=\"currentColor\"></rect><rect x=\"13\" y=\"5.5\" width=\"4\" height=\"13\" rx=\"1\" fill=\"currentColor\"></rect>",
  'phone': "<path d=\"M6.5 3.5 9 4.7l.9 3.3-2 1.7c1 2.3 2.7 4 5 5l1.7-2 3.3.9 1.2 2.5c0 1.9-1.5 3.4-3.4 3.1C9.6 18.4 5.6 14.4 4.8 8.7 4.5 6.8 6 5.3 6.5 3.5Z\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linejoin=\"round\"></path>",
  'plane': "<path d=\"M3 13.5 21 5l-4.5 8.5L21 19l-6.5-2-3 4-1.5-6-7-1.5Z\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linejoin=\"round\"></path>",
  'play': "<circle cx=\"12\" cy=\"12\" r=\"9\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\"></circle><path d=\"M10 8.5v7l6-3.5Z\" fill=\"currentColor\"></path>",
  'plus': "<path d=\"M12 5v14M5 12h14\" stroke=\"currentColor\" stroke-width=\"1.9\" stroke-linecap=\"round\"></path>",
  'repeat': "<path d=\"M4 8h13a2 2 0 0 1 2 2v2M20 16H7a2 2 0 0 1-2-2v-2\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\" stroke-linecap=\"round\"></path><path d=\"M16 5l4 3-4 3M8 19l-4-3 4-3\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\" stroke-linecap=\"round\" stroke-linejoin=\"round\"></path>",
  'search': "<circle cx=\"10.5\" cy=\"10.5\" r=\"6.5\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\"></circle><path d=\"M19 19l-3.8-3.8\" stroke=\"currentColor\" stroke-width=\"1.75\" stroke-linecap=\"round\"></path>",
  'send': "<path d=\"M21 3 3 10.5l6.5 2.5L12 21Z\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\" stroke-linejoin=\"round\"></path><path d=\"M21 3 9.5 13\" stroke=\"currentColor\" stroke-width=\"1.75\"></path>",
  'settings': "<circle cx=\"12\" cy=\"12\" r=\"3\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\"></circle><path d=\"M12 3v2.2M12 18.8V21M4.9 6.1l1.6 1.6M17.5 16.3l1.6 1.6M3 12h2.2M18.8 12H21M4.9 17.9l1.6-1.6M17.5 7.7l1.6-1.6\" stroke=\"currentColor\" stroke-width=\"1.75\" stroke-linecap=\"round\"></path>",
  'share': "<circle cx=\"5.5\" cy=\"12\" r=\"2.2\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\"></circle><circle cx=\"17.5\" cy=\"5.5\" r=\"2.2\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\"></circle><circle cx=\"17.5\" cy=\"18.5\" r=\"2.2\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\"></circle><path d=\"M7.4 10.8 15.6 6.7M7.4 13.2l8.2 4.1\" stroke=\"currentColor\" stroke-width=\"1.6\"></path>",
  'snapchat': "<path d=\"M12 3.5c2.8 0 4 2 4 4.5 0 1 .1 1.7.4 2.3.5.2 1.1.4 1.4.6.4.3 0 .8-.4 1-.5.2-.8.4-1 .7-.1.5-.4 1-.8 1.3.1.5 0 1-.4 1.2-.5.2-1 0-1.4-.1-.6.7-1.5 1.1-2.8 1.1s-2.2-.4-2.8-1.1c-.4.1-.9.3-1.4.1-.4-.2-.5-.7-.4-1.2-.4-.3-.7-.8-.8-1.3-.2-.3-.5-.5-1-.7-.4-.2-.8-.7-.4-1 .3-.2.9-.4 1.4-.6.3-.6.4-1.3.4-2.3 0-2.5 1.2-4.5 4-4.5Z\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linejoin=\"round\"></path>",
  'sparkles': "<path d=\"M11 3l1.6 4.4L17 9l-4.4 1.6L11 15l-1.6-4.4L5 9l4.4-1.6Z\" fill=\"currentColor\"></path><path d=\"M18 14l.8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8Z\" fill=\"currentColor\"></path>",
  'star': "<path d=\"M12 3.5l2.5 5.6 6 .6-4.5 4 1.3 5.9L12 16.8 6.7 19.6 8 13.7l-4.5-4 6-.6Z\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linejoin=\"round\"></path>",
  'sun': "<circle cx=\"12\" cy=\"12\" r=\"4.2\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\"></circle><path d=\"M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5 5l2.1 2.1M16.9 16.9 19 19M19 5l-2.1 2.1M7.1 16.9 5 19\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\"></path>",
  'tiktok': "<path d=\"M14 3v10.5a3.2 3.2 0 1 1-2.6-3.15\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\" stroke-linecap=\"round\"></path><path d=\"M14 3c.4 2.4 2.1 4 4.5 4.3\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\" stroke-linecap=\"round\"></path>",
  'trash': "<path d=\"M5 7h14M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M7 7l1 13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-13\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linejoin=\"round\"></path>",
  'upload': "<path d=\"M12 21V9M7.5 12.5 12 8l4.5 4.5\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\" stroke-linecap=\"round\" stroke-linejoin=\"round\"></path><path d=\"M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\" stroke-linecap=\"round\"></path>",
  'user': "<circle cx=\"12\" cy=\"8\" r=\"3.5\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\"></circle><path d=\"M4.5 20a7.5 7.5 0 0 1 15 0\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\" stroke-linecap=\"round\"></path>",
  'users': "<circle cx=\"9\" cy=\"8\" r=\"3\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\"></circle><path d=\"M3 19a6 6 0 0 1 12 0\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\"></path><path d=\"M16 8.5a2.6 2.6 0 1 1 0-5.1M18.5 19a5 5 0 0 0-4-5\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\"></path>",
  'volume': "<path d=\"M4 9.5h3.5L12 6v12l-4.5-3.5H4Z\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linejoin=\"round\"></path><path d=\"M16 9a4 4 0 0 1 0 6\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\"></path>",
  'whatsapp': "<path d=\"M12 3a9 9 0 0 0-7.8 13.6L3 21l4.6-1.2A9 9 0 1 0 12 3Z\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\" stroke-linejoin=\"round\"></path><path d=\"M8.5 8.7c.2-.6.9-.5 1.3-.2.4.3.6 1 .9 1.5.3.5-.1.9-.4 1.2-.3.3 0 .9.7 1.7.7.8 1.3 1 1.7.7.3-.3.7-.7 1.2-.4.5.3 1.2.5 1.5.9.3.4.4 1.1-.2 1.3-1.6.7-3.5-.1-4.9-1.5-1.4-1.4-2.2-3.3-1.5-4.9Z\" fill=\"currentColor\"></path>",
  'x': "<path d=\"M4.5 4.5l15 15M19.5 4.5l-15 15\" stroke=\"currentColor\" stroke-width=\"1.9\" stroke-linecap=\"round\"></path>",
  'x-circle': "<circle cx=\"12\" cy=\"12\" r=\"9\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\"></circle><path d=\"M9 9l6 6M15 9l-6 6\" stroke=\"currentColor\" stroke-width=\"1.75\" stroke-linecap=\"round\"></path>",
  'youtube': "<rect x=\"2.5\" y=\"6\" width=\"19\" height=\"12\" rx=\"3.5\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\"></rect><path d=\"M10.5 9.5v5l4.5-2.5Z\" fill=\"currentColor\"></path>"
};

/** Tolerated alternate names, so a near-miss never renders an empty box. */
const ALIASES = {
  'tent-tree': 'palm-tree',
  'palm': 'palm-tree',
  'tree-palm': 'palm-tree',
  'drone-camera': 'drone',
  'video': 'film',
  'movie': 'film',
  'photo': 'image',
  'picture': 'image',
  'gallery': 'image',
  'microphone': 'mic',
  'audio': 'volume',
  'gear': 'settings',
  'cog': 'settings',
  'trash-2': 'trash',
  'delete': 'trash',
  'pencil': 'edit',
  'close': 'x',
  'cancel': 'x-circle',
  'tick': 'check',
  'location': 'map-pin',
  'pin': 'map-pin',
  'whatsapp-icon': 'whatsapp',
  'email': 'mail',
  'telephone': 'phone',
  'call': 'phone',
  'notification': 'bell',
  'magnifier': 'search',
  'chain': 'link',
  'url': 'link',
  'basket': 'cart',
  'shopping-cart': 'cart',
  'card': 'credit-card',
  'verified': 'badge-check',
  'rating': 'star',
  'views': 'eye',
  'refresh': 'repeat',
  'retweet': 'repeat',
  'time': 'clock',
  'calendar': 'calendar-check',
  'save': 'bookmark',
  'comment': 'message-circle',
  'chat': 'message-circle',
  'like': 'heart',
  'person': 'user',
  'people': 'users',
  'team': 'users',
  'crew': 'users',
  'world': 'globe',
  'attachment': 'paperclip',
  'attach': 'paperclip',
  'document': 'file',
  'files': 'folder',
  'equipment': 'camera',
  'sunny': 'sun',
  'weather': 'sun'
};
const ICON_NAMES = Object.keys(ICON_PATHS);
function Icon({
  name,
  size = 20,
  color = 'currentColor',
  style,
  ...rest
}) {
  const key = ICON_PATHS[name] ? name : ALIASES[name];
  const inner = ICON_PATHS[key];
  if (!inner) {
    // Never disappear silently: draw a visible placeholder and say what is missing.
    if (typeof console !== 'undefined') {
      console.warn('[Icon] unknown icon name: "' + name + '". Available: ' + ICON_NAMES.join(', '));
    }
    return /*#__PURE__*/React.createElement("svg", _extends({
      viewBox: "0 0 24 24",
      width: size,
      height: size,
      role: "img",
      "aria-label": name,
      style: {
        color,
        flexShrink: 0,
        display: 'inline-block',
        ...style
      }
    }, rest), /*#__PURE__*/React.createElement("rect", {
      x: "3",
      y: "3",
      width: "18",
      height: "18",
      rx: "3",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "1.5",
      strokeDasharray: "3 2"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M8 8l8 8M16 8l-8 8",
      stroke: "currentColor",
      strokeWidth: "1.5",
      strokeLinecap: "round"
    }));
  }
  return /*#__PURE__*/React.createElement("svg", _extends({
    viewBox: "0 0 24 24",
    width: size,
    height: size,
    style: {
      color,
      flexShrink: 0,
      display: 'inline-block',
      ...style
    },
    "aria-label": name,
    role: "img",
    dangerouslySetInnerHTML: {
      __html: inner
    }
  }, rest));
}

// ---- components/core/Button.jsx
function Button({
  children,
  variant = 'primary',
  size = 'md',
  icon,
  disabled = false,
  loading = false,
  onClick,
  style,
  ...rest
}) {
  const sizes = {
    sm: {
      padding: 'var(--button-pad-sm)',
      fontSize: 14,
      gap: 6
    },
    md: {
      padding: 'var(--button-pad-md)',
      fontSize: 16,
      gap: 8
    },
    lg: {
      padding: 'var(--button-pad-lg)',
      fontSize: 18,
      gap: 10
    }
  };
  const inert = disabled || loading;
  const base = {
    fontFamily: 'var(--type-ui-font)',
    fontWeight: 'var(--type-button-weight)',
    border: 'none',
    borderRadius: 'var(--button-radius)',
    cursor: inert ? 'not-allowed' : 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background-color var(--dur-base) var(--ease-standard), color var(--dur-base) var(--ease-standard), border-color var(--dur-base) var(--ease-standard), box-shadow var(--dur-base) var(--ease-standard)',
    opacity: disabled ? 0.5 : 1,
    outline: 'none',
    ...sizes[size]
  };
  const variants = {
    primary: {
      background: 'var(--color-accent)',
      color: 'var(--color-text-on-accent)'
    },
    dark: {
      background: 'var(--color-inverse-bg)',
      color: 'var(--color-inverse-text)'
    },
    outline: {
      background: 'transparent',
      color: 'var(--color-text)',
      border: 'var(--border-hairline)'
    },
    ghost: {
      background: 'transparent',
      color: 'var(--color-text)'
    }
  };
  const hoverBg = {
    primary: 'var(--color-accent-hover)',
    dark: '#2a251f',
    outline: 'var(--color-surface)',
    ghost: 'var(--color-surface)'
  };
  const [hover, setHover] = React.useState(false);
  const [press, setPress] = React.useState(false);
  const [focus, setFocus] = React.useState(false);
  const activeBg = inert ? variants[variant].background : press ? variant === 'primary' ? 'var(--color-accent-press)' : hoverBg[variant] : hover ? hoverBg[variant] : variants[variant].background;
  return /*#__PURE__*/React.createElement("button", _extends({
    disabled: inert,
    "aria-busy": loading || undefined,
    onClick: onClick,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => {
      setHover(false);
      setPress(false);
    },
    onMouseDown: () => setPress(true),
    onMouseUp: () => setPress(false),
    onFocus: () => setFocus(true),
    onBlur: () => setFocus(false),
    style: {
      ...base,
      ...variants[variant],
      background: activeBg,
      boxShadow: focus && !inert ? 'var(--focus-ring)' : 'none',
      ...style
    }
  }, rest), loading ? /*#__PURE__*/React.createElement(Spinner, {
    size: sizes[size].fontSize,
    color: "currentColor",
    style: {
      marginInlineStart: 8
    }
  }) : icon ? /*#__PURE__*/React.createElement(Icon, {
    name: icon,
    size: sizes[size].fontSize + 2,
    style: {
      marginInlineStart: 8
    }
  }) : null, children);
}

// ---- components/documents/Card.jsx
function Card({
  children,
  padded = true,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--color-bg)',
      border: 'var(--border-hairline)',
      borderRadius: 'var(--radius-lg)',
      boxShadow: 'var(--shadow-card)',
      padding: padded ? 'var(--space-5)' : 0,
      ...style
    }
  }, children);
}

// ---- components/documents/Table.jsx
/** Table — RTL data table matching the price-quote / schedule documents:
 * tan header row, hairline cell borders, right-to-left column order. */
function Table({
  columns,
  rows,
  hoverable = true,
  align = 'center',
  style
}) {
  const [hoverRow, setHoverRow] = React.useState(null);
  return /*#__PURE__*/React.createElement("table", {
    dir: "rtl",
    style: {
      width: '100%',
      borderCollapse: 'collapse',
      fontFamily: 'var(--type-ui-font)',
      fontSize: 'var(--type-table-size)',
      color: 'var(--color-text)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, columns.map(col => /*#__PURE__*/React.createElement("th", {
    key: col.key,
    style: {
      background: 'var(--table-head-bg)',
      color: 'var(--table-head-fg)',
      fontWeight: 'var(--type-table-head-weight)',
      padding: 'var(--table-cell-pad)',
      border: 'var(--border-hairline)',
      textAlign: 'center',
      whiteSpace: 'nowrap'
    }
  }, col.label)))), /*#__PURE__*/React.createElement("tbody", null, rows.map((row, i) => /*#__PURE__*/React.createElement("tr", {
    key: i,
    onMouseEnter: () => hoverable && setHoverRow(i),
    onMouseLeave: () => hoverable && setHoverRow(null)
  }, columns.map(col => /*#__PURE__*/React.createElement("td", {
    key: col.key,
    style: {
      background: hoverRow === i ? 'var(--color-accent-soft)' : i % 2 === 0 ? 'var(--table-row-bg-alt)' : 'var(--table-row-bg)',
      padding: 'var(--table-cell-pad)',
      border: 'var(--border-hairline)',
      textAlign: col.align || align,
      verticalAlign: 'top',
      transition: 'background var(--dur-fast) var(--ease-standard)'
    }
  }, row[col.key]))))));
}

// ---- components/feedback/Alert.jsx
const TONES = {
  info: {
    icon: 'file',
    bg: 'var(--color-surface)',
    fg: 'var(--color-text)',
    bar: 'var(--color-info)'
  },
  success: {
    icon: 'check',
    bg: 'var(--color-surface-strong)',
    fg: 'var(--color-text)',
    bar: 'var(--color-success)'
  },
  warning: {
    icon: 'bell',
    bg: 'var(--color-surface-strong)',
    fg: 'var(--color-text)',
    bar: 'var(--color-warning)'
  },
  danger: {
    icon: 'x-circle',
    bg: 'var(--color-surface)',
    fg: 'var(--color-text)',
    bar: 'var(--color-danger)'
  }
};
function Alert({
  tone = 'info',
  title,
  children,
  style
}) {
  const t = TONES[tone];
  return /*#__PURE__*/React.createElement("div", {
    role: "status",
    style: {
      display: 'flex',
      gap: 'var(--space-3)',
      alignItems: 'flex-start',
      background: t.bg,
      color: t.fg,
      border: 'var(--border-hairline)',
      borderRadius: 'var(--alert-radius)',
      padding: 'var(--alert-pad)',
      borderInlineStartWidth: 3,
      borderInlineStartStyle: 'solid',
      borderInlineStartColor: t.bar,
      ...style
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: t.icon,
    size: 18,
    color: t.bar,
    style: {
      marginTop: 2
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, title ? /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--type-ui-font)',
      fontWeight: 700,
      fontSize: 'var(--text-small)',
      marginBottom: children ? 4 : 0
    }
  }, title) : null, children ? /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--type-ui-font)',
      fontSize: 'var(--text-small)',
      lineHeight: 'var(--lh-normal)',
      color: 'var(--color-text-muted)'
    }
  }, children) : null));
}

// ---- components/feedback/EmptyState.jsx
function EmptyState({
  icon = 'folder',
  title,
  description,
  action,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      textAlign: 'center',
      gap: 'var(--space-3)',
      padding: 'var(--space-8) var(--space-5)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 56,
      height: 56,
      borderRadius: '50%',
      background: 'var(--color-surface-strong)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: icon,
    size: 24,
    color: "var(--ink-700)"
  })), title ? /*#__PURE__*/React.createElement("h3", {
    style: {
      fontFamily: 'var(--type-editorial-font)',
      fontWeight: 700,
      fontSize: 'var(--text-h3)',
      margin: 0
    }
  }, title) : null, description ? /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: 'var(--type-ui-font)',
      fontSize: 'var(--text-small)',
      color: 'var(--color-text-muted)',
      margin: 0,
      maxWidth: 360,
      lineHeight: 'var(--lh-normal)'
    }
  }, description) : null, action);
}

// ---- components/feedback/Skeleton.jsx
function Skeleton({
  width = '100%',
  height = 14,
  radius = 'sm',
  style
}) {
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("style", null, `@keyframes ds-skeleton{0%{opacity:.5}50%{opacity:1}100%{opacity:.5}}`), /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      display: 'block',
      width,
      height,
      background: 'var(--color-surface-strong)',
      borderRadius: `var(--radius-${radius})`,
      animation: 'ds-skeleton 1.4s var(--ease-standard) infinite',
      ...style
    }
  }));
}

// ---- components/feedback/Spinner.jsx
function Spinner({
  size = 20,
  color = 'var(--color-accent)',
  label,
  style
}) {
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 'var(--space-2)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("style", null, `@keyframes ds-spin{to{transform:rotate(360deg)}}`), /*#__PURE__*/React.createElement("span", {
    role: "status",
    "aria-label": label || 'جاري التحميل',
    style: {
      width: size,
      height: size,
      borderRadius: '50%',
      border: `2px solid var(--color-border-subtle)`,
      borderTopColor: color,
      animation: 'ds-spin .8s linear infinite',
      flexShrink: 0,
      display: 'inline-block'
    }
  }), label ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--type-ui-font)',
      fontSize: 'var(--text-small)',
      color: 'var(--color-text-muted)'
    }
  }, label) : null);
}

// ---- components/feedback/Toast.jsx
function Toast({
  tone = 'info',
  message,
  onDismiss,
  style
}) {
  const colors = {
    info: 'var(--color-info)',
    success: 'var(--color-success)',
    warning: 'var(--color-warning)',
    danger: 'var(--color-danger)'
  };
  return /*#__PURE__*/React.createElement("div", {
    role: "status",
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 'var(--space-3)',
      background: 'var(--color-inverse-bg)',
      color: 'var(--color-inverse-text)',
      borderRadius: 'var(--radius-md)',
      padding: '12px 16px',
      boxShadow: 'var(--shadow-lift)',
      fontFamily: 'var(--type-ui-font)',
      fontSize: 'var(--text-small)',
      fontWeight: 600,
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 8,
      height: 8,
      borderRadius: '50%',
      background: colors[tone],
      flexShrink: 0
    }
  }), /*#__PURE__*/React.createElement("span", null, message), onDismiss ? /*#__PURE__*/React.createElement("button", {
    onClick: onDismiss,
    "aria-label": "\u0625\u063A\u0644\u0627\u0642",
    style: {
      background: 'transparent',
      border: 'none',
      cursor: 'pointer',
      padding: 0,
      display: 'inline-flex',
      marginInlineStart: 'var(--space-2)'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "x",
    size: 14,
    color: "var(--ink-300)"
  })) : null);
}

// ---- components/forms/Checkbox.jsx
function Checkbox({
  checked,
  onChange,
  label,
  disabled,
  style
}) {
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 'var(--space-2)',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.5 : 1,
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    onClick: () => !disabled && onChange && onChange(!checked),
    style: {
      width: 20,
      height: 20,
      borderRadius: 'var(--radius-sm)',
      border: checked ? 'none' : 'var(--border-hairline)',
      background: checked ? 'var(--color-accent)' : 'var(--field-bg)',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
      transition: 'background var(--dur-fast) var(--ease-standard)'
    }
  }, checked ? /*#__PURE__*/React.createElement(Icon, {
    name: "check",
    size: 13,
    color: "var(--color-text-on-accent)"
  }) : null), label ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--type-ui-font)',
      fontSize: 'var(--text-small)'
    }
  }, label) : null);
}

// ---- components/forms/Field.jsx
/** Field — shared label/hint/error wrapper for every form control. */
function Field({
  label,
  hint,
  error,
  required,
  htmlFor,
  children,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-2)',
      ...style
    }
  }, label ? /*#__PURE__*/React.createElement("label", {
    htmlFor: htmlFor,
    style: {
      fontFamily: 'var(--type-ui-font)',
      fontSize: 'var(--type-label-size)',
      fontWeight: 'var(--type-label-weight)',
      color: 'var(--color-text-muted)'
    }
  }, label, required ? /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--color-danger)',
      marginInlineStart: 4
    }
  }, "*") : null) : null, children, error ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--text-caption)',
      color: 'var(--color-danger)',
      fontWeight: 600
    }
  }, error) : hint ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--text-caption)',
      color: 'var(--color-text-muted)'
    }
  }, hint) : null);
}

// ---- components/forms/Input.jsx
const controlBase = {
  fontFamily: 'var(--type-ui-font)',
  fontSize: 'var(--text-body)',
  color: 'var(--color-text)',
  background: 'var(--field-bg)',
  border: 'var(--field-border)',
  borderRadius: 'var(--field-radius)',
  padding: 'var(--field-pad)',
  width: '100%',
  boxSizing: 'border-box',
  outline: 'none',
  transition: 'border-color var(--dur-base) var(--ease-standard), box-shadow var(--dur-base) var(--ease-standard)'
};
function Input({
  invalid,
  disabled,
  style,
  ...rest
}) {
  const [focus, setFocus] = React.useState(false);
  return /*#__PURE__*/React.createElement("input", _extends({
    disabled: disabled,
    onFocus: () => setFocus(true),
    onBlur: () => setFocus(false),
    style: {
      ...controlBase,
      minHeight: 'var(--field-height)',
      borderColor: invalid ? 'var(--color-danger)' : focus ? 'var(--color-focus-ring)' : undefined,
      boxShadow: focus ? 'var(--focus-ring)' : 'none',
      background: disabled ? 'var(--color-surface)' : 'var(--field-bg)',
      opacity: disabled ? 0.6 : 1,
      cursor: disabled ? 'not-allowed' : 'text',
      ...style
    }
  }, rest));
}

// ---- components/forms/Radio.jsx
function Radio({
  checked,
  onChange,
  label,
  disabled,
  style
}) {
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 'var(--space-2)',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.5 : 1,
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    onClick: () => !disabled && onChange && onChange(true),
    style: {
      width: 20,
      height: 20,
      borderRadius: '50%',
      border: checked ? '6px solid var(--color-accent)' : 'var(--border-hairline)',
      background: 'var(--field-bg)',
      boxSizing: 'border-box',
      flexShrink: 0,
      transition: 'border var(--dur-fast) var(--ease-standard)'
    }
  }), label ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--type-ui-font)',
      fontSize: 'var(--text-small)'
    }
  }, label) : null);
}

// ---- components/forms/Search.jsx
function Search({
  value,
  onChange,
  placeholder = 'ابحث…',
  style,
  ...rest
}) {
  const [focus, setFocus] = React.useState(false);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-2)',
      background: 'var(--field-bg)',
      border: 'var(--field-border)',
      borderRadius: 'var(--radius-pill)',
      padding: '0 var(--space-4)',
      minHeight: 'var(--field-height)',
      borderColor: focus ? 'var(--color-focus-ring)' : undefined,
      boxShadow: focus ? 'var(--focus-ring)' : 'none',
      transition: 'border-color var(--dur-base) var(--ease-standard), box-shadow var(--dur-base) var(--ease-standard)',
      ...style
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "search",
    size: 17,
    color: "var(--color-text-muted)"
  }), /*#__PURE__*/React.createElement("input", _extends({
    value: value,
    onChange: onChange,
    placeholder: placeholder,
    onFocus: () => setFocus(true),
    onBlur: () => setFocus(false),
    style: {
      border: 'none',
      outline: 'none',
      background: 'transparent',
      fontFamily: 'var(--type-ui-font)',
      fontSize: 'var(--text-body)',
      color: 'var(--color-text)',
      flex: 1,
      minWidth: 0
    }
  }, rest)));
}

// ---- components/forms/Select.jsx
function Select({
  options = [],
  value,
  onChange,
  disabled,
  invalid,
  style,
  ...rest
}) {
  const [focus, setFocus] = React.useState(false);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      ...style
    }
  }, /*#__PURE__*/React.createElement("select", _extends({
    value: value,
    onChange: onChange,
    disabled: disabled,
    onFocus: () => setFocus(true),
    onBlur: () => setFocus(false),
    style: {
      fontFamily: 'var(--type-ui-font)',
      fontSize: 'var(--text-body)',
      color: 'var(--color-text)',
      background: disabled ? 'var(--color-surface)' : 'var(--field-bg)',
      border: 'var(--field-border)',
      borderRadius: 'var(--field-radius)',
      padding: 'var(--field-pad)',
      paddingInlineStart: 'var(--space-8)',
      minHeight: 'var(--field-height)',
      width: '100%',
      boxSizing: 'border-box',
      outline: 'none',
      appearance: 'none',
      cursor: disabled ? 'not-allowed' : 'pointer',
      borderColor: invalid ? 'var(--color-danger)' : focus ? 'var(--color-focus-ring)' : undefined,
      boxShadow: focus ? 'var(--focus-ring)' : 'none',
      opacity: disabled ? 0.6 : 1
    }
  }, rest), options.map(o => {
    const val = typeof o === 'string' ? o : o.value;
    const lbl = typeof o === 'string' ? o : o.label;
    return /*#__PURE__*/React.createElement("option", {
      key: val,
      value: val
    }, lbl);
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      insetInlineStart: 'var(--space-4)',
      top: '50%',
      transform: 'translateY(-50%)',
      pointerEvents: 'none'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "chevron-down",
    size: 16,
    color: "var(--color-text-muted)"
  })));
}

// ---- components/forms/Switch.jsx
function Switch({
  checked,
  onChange,
  label,
  disabled,
  style
}) {
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 'var(--space-3)',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.5 : 1,
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    onClick: () => !disabled && onChange && onChange(!checked),
    style: {
      width: 42,
      height: 24,
      borderRadius: 'var(--radius-pill)',
      background: checked ? 'var(--color-accent)' : 'var(--color-border)',
      position: 'relative',
      flexShrink: 0,
      transition: 'background var(--dur-base) var(--ease-standard)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      top: 3,
      insetInlineStart: checked ? 21 : 3,
      width: 18,
      height: 18,
      borderRadius: '50%',
      background: 'var(--paper-0)',
      transition: 'inset-inline-start var(--dur-base) var(--ease-standard)'
    }
  })), label ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--type-ui-font)',
      fontSize: 'var(--text-small)'
    }
  }, label) : null);
}

// ---- components/forms/Textarea.jsx
function Textarea({
  invalid,
  disabled,
  rows = 4,
  style,
  ...rest
}) {
  const [focus, setFocus] = React.useState(false);
  return /*#__PURE__*/React.createElement("textarea", _extends({
    rows: rows,
    disabled: disabled,
    onFocus: () => setFocus(true),
    onBlur: () => setFocus(false),
    style: {
      fontFamily: 'var(--type-ui-font)',
      fontSize: 'var(--text-body)',
      lineHeight: 'var(--lh-normal)',
      color: 'var(--color-text)',
      background: disabled ? 'var(--color-surface)' : 'var(--field-bg)',
      border: 'var(--field-border)',
      borderRadius: 'var(--field-radius)',
      padding: 'var(--field-pad)',
      width: '100%',
      boxSizing: 'border-box',
      outline: 'none',
      resize: 'vertical',
      borderColor: invalid ? 'var(--color-danger)' : focus ? 'var(--color-focus-ring)' : undefined,
      boxShadow: focus ? 'var(--focus-ring)' : 'none',
      opacity: disabled ? 0.6 : 1,
      transition: 'border-color var(--dur-base) var(--ease-standard), box-shadow var(--dur-base) var(--ease-standard)',
      ...style
    }
  }, rest));
}

// ---- components/navigation/Tabs.jsx
function Tabs({
  items = [],
  value,
  onChange,
  tone = 'light',
  style
}) {
  const isDark = tone === 'dark';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 'var(--space-2)',
      flexWrap: 'wrap',
      ...style
    }
  }, items.map(it => {
    const val = typeof it === 'string' ? it : it.value;
    const lbl = typeof it === 'string' ? it : it.label;
    const active = val === value;
    return /*#__PURE__*/React.createElement("button", {
      key: val,
      onClick: () => onChange && onChange(val),
      style: {
        fontFamily: 'var(--type-ui-font)',
        fontWeight: 700,
        fontSize: 'var(--text-small)',
        padding: '10px 20px',
        borderRadius: 'var(--radius-pill)',
        border: 'none',
        cursor: 'pointer',
        background: active ? 'var(--color-accent)' : 'transparent',
        color: active ? 'var(--color-text-on-accent)' : isDark ? 'var(--color-text-subtle)' : 'var(--color-text-muted)',
        transition: 'background var(--dur-base) var(--ease-standard), color var(--dur-base) var(--ease-standard)'
      }
    }, lbl);
  }));
}

export { Badge, Icon, Button, Card, Table, Alert, EmptyState, Skeleton, Spinner, Toast, Checkbox, Field, Input, Radio, Search, Select, Switch, Textarea, Tabs };
