/* MAHYAR VPN — static catalogue of server locations (demo data).
 * latency/load are baseline values; the bridge jitters them on each "ping". */
'use strict';

window.MV_SERVERS = [
  { id: 'auto',   cc: 'un', country: 'Smart Location', city: 'Fastest available', latency: 0,   load: 0,  status: 'online', smart: true },
  { id: 'de-fra', cc: 'de', country: 'Germany',        city: 'Frankfurt',  latency: 48,  load: 42, status: 'online' },
  { id: 'nl-ams', cc: 'nl', country: 'Netherlands',    city: 'Amsterdam',  latency: 52,  load: 37, status: 'online' },
  { id: 'tr-ist', cc: 'tr', country: 'Turkey',         city: 'Istanbul',   latency: 38,  load: 71, status: 'busy' },
  { id: 'ae-dxb', cc: 'ae', country: 'UAE',            city: 'Dubai',      latency: 34,  load: 55, status: 'online' },
  { id: 'gb-lon', cc: 'gb', country: 'United Kingdom', city: 'London',     latency: 61,  load: 48, status: 'online' },
  { id: 'fr-par', cc: 'fr', country: 'France',         city: 'Paris',      latency: 58,  load: 33, status: 'online' },
  { id: 'fi-hel', cc: 'fi', country: 'Finland',        city: 'Helsinki',   latency: 66,  load: 21, status: 'online' },
  { id: 'se-sto', cc: 'se', country: 'Sweden',         city: 'Stockholm',  latency: 69,  load: 26, status: 'online' },
  { id: 'ch-zrh', cc: 'ch', country: 'Switzerland',    city: 'Zurich',     latency: 57,  load: 29, status: 'online' },
  { id: 'am-evn', cc: 'am', country: 'Armenia',        city: 'Yerevan',    latency: 29,  load: 83, status: 'busy' },
  { id: 'us-nyc', cc: 'us', country: 'United States',  city: 'New York',   latency: 128, load: 52, status: 'online' },
  { id: 'us-lax', cc: 'us', country: 'United States',  city: 'Los Angeles',latency: 189, load: 44, status: 'online' },
  { id: 'ca-tor', cc: 'ca', country: 'Canada',         city: 'Toronto',    latency: 134, load: 31, status: 'online' },
  { id: 'sg-sin', cc: 'sg', country: 'Singapore',      city: 'Singapore',  latency: 142, load: 39, status: 'online' },
  { id: 'jp-tyo', cc: 'jp', country: 'Japan',          city: 'Tokyo',      latency: 196, load: 46, status: 'online' },
  { id: 'au-syd', cc: 'au', country: 'Australia',      city: 'Sydney',     latency: 248, load: 18, status: 'online' },
  { id: 'br-sao', cc: 'br', country: 'Brazil',         city: 'São Paulo',  latency: 231, load: 0,  status: 'offline' },
];

window.MV_FLAG = function (cc) {
  if (cc === 'un') {
    // neutral "smart" globe badge rendered as inline SVG (no binary assets)
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 21"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FF7A3D"/><stop offset="1" stop-color="#E0200A"/></linearGradient></defs><rect width="30" height="21" rx="3" fill="#1a0f0b"/><path d="M15 3.5l1.9 4.3 4.6.4-3.5 3 1.1 4.6-4.1-2.5-4.1 2.5 1.1-4.6-3.5-3 4.6-.4z" fill="url(#g)"/></svg>');
  }
  return 'https://flagcdn.com/w80/' + cc + '.png';
};
