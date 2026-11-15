function notFound(req, res) {
  res.status(404).json({ error: "The requested resource was not found." });
}

function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    return next(error);
  }

  if (error.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Request body must contain valid JSON." });
  }

  if (error.code === "ER_DUP_ENTRY") {
    return res.status(409).json({ error: "A record with those details already exists." });
  }

  if (error.code === "ER_NO_REFERENCED_ROW_2") {
    return res.status(400).json({ error: "Choose a valid category." });
  }

  console.error("Request failed", {
    method: req.method,
    path: req.path,
    message: error.message,
  });
  return res.status(500).json({ error: "The server could not complete the request. Please try again." });
}

module.exports = { notFound, errorHandler };
