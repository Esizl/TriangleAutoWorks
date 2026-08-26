module.exports = {
  ensureAuthenticated: function (req, res, next) {
    if (req.isAuthenticated()) {
      return next()
    }
    req.flash('errorMessage', 'Please log in to access.')
    res.redirect('/login')
  },
  forwardAuthenticated: function (req, res, next) {
    if (!req.isAuthenticated()) {
      return next()
    }
    res.redirect('/')
  },
  // role: 1 = customer, 2 = admin/staff, 3 = owner/manager/dev
  ensureAdmin: function (req, res, next) {
    if (req.isAuthenticated() && req.user && req.user.role >= 2) {
      return next()
    }
    if (!req.isAuthenticated()) {
      req.flash('errorMessage', 'Please log in to access.')
      return res.redirect('/login')
    }
    req.flash('errorMessage', 'You do not have permission to access that page.')
    res.redirect('/')
  }
}