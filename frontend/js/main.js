/* GunWaree shared page bootstrap: builds the 3D scene, then swaps skeletons for content.
   Load order on every page: i18n.js, api.js, scene.js, main.js (all deferred). */

(function (GW) {
  'use strict';

  var root = document.documentElement;

  // Build the scene first so it is in place when the skeletons go away
  if (GW.scene) GW.scene.init(document.querySelector('[data-scene]'));

  /* ---------- Skeleton reveal ---------- */

  function reveal() {
    if (!root.classList.contains('is-loading')) return;
    root.classList.remove('is-loading');
    root.classList.add('is-ready');
  }

  var fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  var pageLoaded = new Promise(function (resolve) {
    if (document.readyState === 'complete') resolve();
    else window.addEventListener('load', resolve, { once: true });
  });
  var cap = new Promise(function (resolve) { setTimeout(resolve, 1500); });

  Promise.race([Promise.all([fontsReady, pageLoaded]), cap]).then(reveal, reveal);
})(window.GW = window.GW || {});
