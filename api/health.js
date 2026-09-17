'use strict';

const { sendJson } = require('../server/http.js');

module.exports = function healthHandler(request, response) {
  if ((request.method || 'GET').toUpperCase() !== 'GET') {
    sendJson(
      response,
      405,
      {
        error: {
          code: 'METHOD_NOT_ALLOWED',
          message: 'Only GET is supported.',
          details: {}
        }
      },
      { Allow: 'GET', 'Cache-Control': 'no-store' }
    );
    return;
  }

  sendJson(response, 200, { data: { ok: true } }, { 'Cache-Control': 'no-store' });
};
