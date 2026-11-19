// Global error handler
export const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);

  // Anything can be thrown (a string, a pg error without .message, …); never
  // let the error handler itself crash on it.
  if (!err || typeof err.message !== 'string') {
    return res.status(500).json({ success: false, error: 'Server Error', message: 'Internal server error' });
  }

  // Oversized or malformed JSON bodies are the client's fault, not ours.
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ success: false, error: 'Payload Too Large', message: 'Request body is too large' });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, error: 'Bad Request', message: 'Request body is not valid JSON' });
  }

  if (err.message.includes('Invalid or expired token')) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: 'Invalid or expired token'
    });
  }

  if (err.message.includes('Validation')) {
    return res.status(400).json({
      success: false,
      error: 'Validation Error',
      message: err.message,
      details: err.details || []
    });
  }

  if (err.message.includes('not found')) {
    return res.status(404).json({
      success: false,
      error: 'Not Found',
      message: err.message
    });
  }

  if (err.message.includes('already exists')) {
    return res.status(409).json({
      success: false,
      error: 'Conflict',
      message: err.message
    });
  }

  return res.status(500).json({
    success: false,
    error: 'Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
};

// Async handler wrapper
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
