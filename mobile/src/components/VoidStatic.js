/**
 * VoidStatic — the void intrudes, occasionally.
 *
 * A brief full-screen TV-static burst that flickers in every so often (randomized 22–70s), like
 * the signal dropping for a beat, then clears. NOT a constant grain film — just the occasional
 * interference that reminds you everything's suspended in the void. Atmospheric, lightweight,
 * pointer-events:none so it never blocks interaction. Web only (relies on CSS + an SVG noise DOM).
 *
 * Tuning knobs live at the top: BURST_MIN/MAX (gap between bursts), and the peak opacity in the
 * voidStaticBurst keyframe (currently ~0.20).
 *
 * NOTE: module-level `var` + raw <div> mirror VoidIntro's working web pattern (avoids TDZ in prod
 * bundles; RN-Web renders to the DOM so a bare div sibling is fine).
 */
import React, { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

var BURST_MIN = 35000;  // ms — shortest gap between static bursts (kept rare; a touch, not a tic)
var BURST_MAX = 100000; // ms — longest gap

// Reuse the proven feTurbulence noise (same approach as FastImage's static dissolve).
var NOISE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E" +
  "%3Cfilter id='vs'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' " +
  "numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E" +
  "%3Crect width='200' height='200' filter='url(%23vs)' opacity='0.5'/%3E%3C/svg%3E";

var _kfInjected = false;
function injectKeyframes() {
  if (_kfInjected || typeof document === 'undefined') return;
  _kfInjected = true;
  var s = document.createElement('style');
  s.id = 'void-static-burst-css';
  // One burst = an opacity flicker + the noise crawling, then back to nothing.
  s.textContent =
    '@keyframes voidStaticBurst{' +
    '0%{opacity:0;background-position:0 0}' +
    '12%{opacity:0.07;background-position:-30px 20px}' +
    '30%{opacity:0.04;background-position:25px -30px}' +
    '50%{opacity:0.08;background-position:-20px 28px}' +
    '70%{opacity:0.04;background-position:35px -12px}' +
    '88%{opacity:0.06;background-position:-12px -25px}' +
    '100%{opacity:0;background-position:0 0}}';
  document.head.appendChild(s);
}

export default function VoidStatic() {
  if (Platform.OS !== 'web') return null;
  var ref = useRef(null);

  useEffect(function () {
    if (typeof document === 'undefined') return;
    injectKeyframes();
    var el = ref.current;
    if (!el) return;
    var timer = null;
    var alive = true;

    function fire() {
      if (!alive || !el) return;
      // Never impede what you're watching — skip the burst while the content player is on screen.
      if (document.querySelector('[data-vpcontainer="1"]')) { schedule(); return; }
      var dur = 500 + Math.floor(Math.random() * 400); // 0.5–0.9s burst — a brief touch
      try {
        el.style.animation = 'none';
        void el.offsetWidth; // force reflow so the animation re-triggers each time
        el.style.animation = 'voidStaticBurst ' + dur + 'ms steps(10)';
      } catch (e) {}
      schedule();
    }
    function schedule() {
      if (timer) clearTimeout(timer);
      var gap = BURST_MIN + Math.floor(Math.random() * (BURST_MAX - BURST_MIN));
      timer = setTimeout(fire, gap);
    }
    schedule(); // first burst lands after a randomized gap — not on load

    return function () { alive = false; if (timer) clearTimeout(timer); };
  }, []);

  return React.createElement('div', {
    ref: ref,
    'aria-hidden': true,
    style: {
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      pointerEvents: 'none',
      zIndex: 9998,            // under VoidIntro (9999), over the app
      opacity: 0,
      backgroundImage: 'url("' + NOISE + '")',
      backgroundRepeat: 'repeat',
      mixBlendMode: 'screen',  // gray noise glows over the dark void instead of muddying it
    },
  });
}
