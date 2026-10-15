/* GunWaree maps: real maps from OpenFreeMap (free, no key, no watermark; OpenStreetMap data),
   drawn with MapLibre GL. Shared by Dam levels, Water levels and the rescue report pin.

   GW.maps.create(stage, options)  makes a map inside a .map-card__stage (or any box with [data-map]),
                                   with water tinted blue, labels in the chosen language, 3D buildings
                                   when zoomed in and tilted, and the zoom / 3D / reset buttons wired.
                                   Resolves to null (and shows a short message) if the map cannot load. */

(function (GW) {
  'use strict';

  var STYLE = 'https://tiles.openfreemap.org/styles/positron';
  var lang = GW.lang;

  function available() {
    return !!(window.maplibregl && typeof window.maplibregl.Map === 'function');
  }

  function gestureLocale() {
    return {
      'CooperativeGesturesHandler.WindowsHelpText': lang.t('map.gestureWin'),
      'CooperativeGesturesHandler.MacHelpText': lang.t('map.gestureMac'),
      'CooperativeGesturesHandler.MobileHelpText': lang.t('map.gestureMobile'),
      'NavigationControl.ZoomIn': lang.t('map.zoomIn'),
      'NavigationControl.ZoomOut': lang.t('map.zoomOut')
    };
  }

  // Place and street names in the page language (Latin names in English, Thai names in Thai)
  function labelField() {
    return lang.get() === 'th'
      ? ['coalesce', ['get', 'name:th'], ['get', 'name'], ['get', 'name:latin']]
      : ['coalesce', ['get', 'name:en'], ['get', 'name:latin'], ['get', 'name']];
  }

  function applyLabels(map) {
    var style = map.getStyle();
    if (!style) return;
    style.layers.forEach(function (l) {
      if (l.type !== 'symbol' || !l.layout || !l.layout['text-field']) return;
      var tf = JSON.stringify(l.layout['text-field']);
      if (tf.indexOf('name') < 0) return;
      map.setLayoutProperty(l.id, 'text-field', labelField());
    });
  }

  function tune(map) {
    // Water in the palette's blue, so rivers and canals read at a glance
    if (map.getLayer('water')) map.setPaintProperty('water', 'fill-color', '#BCDDE6');
    if (map.getLayer('waterway')) map.setPaintProperty('waterway', 'line-color', '#9DCBD6');
    applyLabels(map);
    // Real building heights once you zoom in; they stand up when the map is tilted
    if (!map.getLayer('gw-buildings') && map.getSource('openmaptiles')) {
      var before = map.getLayer('waterway_line_label') ? 'waterway_line_label' : undefined;
      map.addLayer({
        id: 'gw-buildings',
        type: 'fill-extrusion',
        source: 'openmaptiles',
        'source-layer': 'building',
        minzoom: 14,
        paint: {
          'fill-extrusion-color': '#E3E8E6',
          'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 6],
          'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
          'fill-extrusion-opacity': ['interpolate', ['linear'], ['zoom'], 14, 0, 15, 0.85]
        }
      }, before);
    }
  }

  function offline(stage) {
    var msg = stage.querySelector('[data-map-offline]');
    if (msg) msg.hidden = false;
  }

  /*
    options: { center: [lon, lat], zoom, bounds, onReset(map), tiltPitch }
    Resolves with the map once its style has loaded.
  */
  function create(stage, options) {
    options = options || {};
    // Wait for the page transition to finish: building a WebGL map mid-animation would make it stutter
    return Promise.resolve(window.gwRevealed).then(function () { return build(stage, options); });
  }

  function build(stage, options) {
    var box = stage.querySelector('[data-map]') || stage;
    if (!available()) { offline(stage); return Promise.resolve(null); }

    var map;
    try {
      map = new window.maplibregl.Map({
        container: box,
        style: STYLE,
        center: options.center || [100.52, 13.75],
        zoom: options.zoom || 10,
        bounds: options.bounds,
        fitBoundsOptions: { padding: 50 },
        maxPitch: 65,
        cooperativeGestures: true,
        attributionControl: { compact: true },
        locale: gestureLocale()
      });
    } catch (e) {
      offline(stage);
      return Promise.resolve(null);
    }

    wire(stage, map, options);
    document.addEventListener('gw:lang', function () { if (map.isStyleLoaded()) applyLabels(map); });

    return new Promise(function (resolve) {
      var done = false;
      var timer = setTimeout(function () { if (!done) { done = true; offline(stage); resolve(null); } }, 20000);
      map.on('load', function () {
        if (done) return;
        done = true;
        clearTimeout(timer);
        try { tune(map); } catch (e) { /* the base map still works without the tweaks */ }
        resolve(map);
      });
    });
  }

  // Zoom, 3D tilt and "show everything" buttons
  function wire(stage, map, options) {
    var tiltBtn = stage.querySelector('[data-map-ctrl="tilt"]');
    function syncTilt() {
      if (tiltBtn) tiltBtn.setAttribute('aria-pressed', String(map.getPitch() > 5));
    }
    map.on('pitchend', syncTilt);

    stage.querySelectorAll('[data-map-ctrl]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var what = btn.getAttribute('data-map-ctrl');
        if (what === 'in') map.zoomIn();
        else if (what === 'out') map.zoomOut();
        else if (what === 'tilt') {
          var tilted = map.getPitch() > 5;
          map.easeTo({ pitch: tilted ? 0 : (options.tiltPitch || 55), bearing: tilted ? 0 : -18, duration: 900 });
        } else if (what === 'reset') {
          GW.fmt.replay(btn, 'is-spun', 700);
          if (options.onReset) options.onReset(map);
          else map.easeTo({ center: options.center, zoom: options.zoom, pitch: 0, bearing: 0, duration: 900 });
        }
      });
    });
  }

  GW.maps = { create: create, available: available };
})(window.GW = window.GW || {});
