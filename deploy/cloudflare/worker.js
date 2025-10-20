// Cloudflare Workers entry point
const { cloudflareFetch } = require('../../dist/api/handler');

addEventListener('fetch', event => {
  event.respondWith(cloudflareFetch(event.request));
});