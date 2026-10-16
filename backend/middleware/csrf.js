const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// Double-submit cookie CSRF check. Only applies to requests authenticated via
// the httpOnly `access_token` cookie (the web app). Bearer-token requests
// carry no ambient browser credentials, so they aren't CSRF-able and are
// left alone.
const verifyCsrf = (req, res, next) => {
  if (!MUTATING_METHODS.has(req.method)) return next();
  if (req.headers.authorization) return next();
  if (!req.cookies || !req.cookies.access_token) return next();

  const cookieToken = req.cookies.csrf_token;
  const headerToken = req.headers["x-csrf-token"];

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    res.status(403);
    throw new Error("Invalid or missing CSRF token");
  }

  next();
};

module.exports = { verifyCsrf };
