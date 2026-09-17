'use strict';

class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.details = details || {};
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        details: this.details
      }
    };
  }
}

function validationError(message, status, details) {
  return new HttpError(status || 400, 'VALIDATION_ERROR', message, details);
}

function bodyForJson(body) {
  if (body instanceof HttpError) {
    return body.toJSON();
  }
  if (body instanceof Error) {
    return {
      error: {
        code: body.code || 'INTERNAL_ERROR',
        message: body.message || 'Request failed.',
        details: body.details || {}
      }
    };
  }
  return body;
}

function sendJson(response, status, body, headers) {
  response.statusCode = status;
  const extraHeaders = headers || {};
  for (const [name, value] of Object.entries(extraHeaders)) {
    response.setHeader(name, value);
  }
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(bodyForJson(body)));
}

function contentTypeIsJson(contentType) {
  return /^application\/json(?:\s*;|\s*$)/i.test(contentType || '');
}

async function parseJsonBody(request, maxBytes) {
  const byteLimit = Number.isFinite(maxBytes) ? maxBytes : 65536;
  const headers = request && request.headers ? request.headers : {};
  const contentType = headers['content-type'] || headers['Content-Type'];
  if (contentType && !contentTypeIsJson(contentType)) {
    throw validationError('Content-Type must be application/json.', 415, {
      field: 'content-type'
    });
  }

  const declaredLength = Number(headers['content-length'] || headers['Content-Length']);
  if (Number.isFinite(declaredLength) && declaredLength > byteLimit) {
    throw validationError('Request body is too large.', 413, {
      maxBytes: byteLimit
    });
  }

  const chunks = [];
  let totalBytes = 0;
  try {
    for await (const chunk of request) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
      totalBytes += buffer.byteLength;
      if (totalBytes > byteLimit) {
        throw validationError('Request body is too large.', 413, {
          maxBytes: byteLimit
        });
      }
      chunks.push(buffer);
    }
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }
    throw validationError('Request body could not be read.', 400);
  }

  if (chunks.length === 0) {
    throw validationError('Request body must be a JSON object.', 400);
  }

  let parsed;
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (error) {
    throw validationError('Request body must be valid JSON.', 400);
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw validationError('Request body must be a JSON object.', 400);
  }

  return parsed;
}

async function assertEmptyBody(request, maxBytes) {
  const byteLimit = Number.isFinite(maxBytes) ? maxBytes : 65536;
  const headers = request && request.headers ? request.headers : {};
  const declaredLength = Number(headers['content-length'] || headers['Content-Length']);
  if (Number.isFinite(declaredLength) && declaredLength > byteLimit) {
    throw validationError('Request body is too large.', 413, {
      maxBytes: byteLimit
    });
  }
  if (!request || typeof request[Symbol.asyncIterator] !== 'function') return;

  let totalBytes = 0;
  let hasBody = false;
  try {
    for await (const chunk of request) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
      if (buffer.byteLength === 0) continue;
      hasBody = true;
      totalBytes += buffer.byteLength;
      if (totalBytes > byteLimit) {
        throw validationError('Request body is too large.', 413, {
          maxBytes: byteLimit
        });
      }
    }
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw validationError('Request body could not be read.', 400);
  }

  if (hasBody) {
    throw validationError('This request must not include a body.', 400);
  }
}

module.exports = {
  assertEmptyBody,
  HttpError,
  parseJsonBody,
  sendJson,
  validationError
};
