const requireLogin = (req, res, next) => {
  if (req.session && req.session.user) {
    return next();
  }
  res.redirect("/login");
};

const requireAdmin = (req, res, next) => {
  if (req.session && req.session.user && req.session.user.es_admin) {
    return next();
  }
  res.redirect("/docente");
};

module.exports = { requireLogin, requireAdmin };
