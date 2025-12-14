// const wrapAsync = require("./utils/wrapAsync");
// const ExpressError = require("./utils/ExpressError.js");
// const { listingSchema, reviewSchema } = require("./schema.js");
const User = require("./models/user.js");

module.exports.isLoggedIn = (req, res, next) => {
    if (!req.isAuthenticated()) {
        req.session.redirectUrl = req.originalUrl;
        req.flash("error", "Please Login to continue");
        return res.redirect("/login");
    }
    next();
}

module.exports.saveRedirectUrl = (req, res, next) => {
    if (req.session.redirectUrl) {
        res.locals.redirectUrl = req.session.redirectUrl;
    }
    next();
}

module.exports.isAdmin = (req, res, next) => {
  if (req.user.role !== "admin") {
    req.flash("error", "Access denied. Admins only.");
    return res.redirect(req.session.redirectUrl || "/home");
  }
  next();
}

module.exports.checkNotBanned = async (req, res, next) => {
  try {
    const { username } = req.body;

    console.log("Checking ban status for user:", username);

    const user = await User.findOne({ username });

    if (user && user.isBanned) {
      req.flash("error", "Your account has been banned. Please contact admin.");
      return res.redirect("/login");
    }

    next();
  } catch (err) {
    next(err);
  }
};