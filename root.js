const express = require('express');
const csrf = require('csurf');
const router = express.Router();
const path = require('path');
const { authMiddleware } = require('./controller/createCompany');

// Update views directory path
router.use((req, res, next) => {
    res.locals.viewPath = path.join(__dirname, 'views');
    next();
});

// CSRF middleware for router
const csrfProtection = csrf({ cookie: true });

// İlk sayfa route - CSRF token ekle
router.get('/', csrfProtection, (req, res) => {
    res.render('login', { 
        csrfToken: req.csrfToken(),
        error: null 
    });
});

// Signup sayfası route
router.get('/signup', (req, res) => {
    res.render('signup');
});

// Homepage sayfası route
router.get('/anasayfa', (req, res) => {
    res.render('anasayfa', { error: null });
});

router.get('/cari_hesap_ekstresi', (req, res) => {
    res.render('cari/cariekstre', { error: null });
});












module.exports = router;
