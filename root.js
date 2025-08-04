const express = require('express');
const csrf = require('csurf');
const router = express.Router();
const path = require('path');
const { authMiddleware } = require('./controller/createCompany');
const mysql = require('mysql2/promise');
const { getTenantDbConfig } = require('./controller/db');
const irsaliyeController = require('./controller/irsaliye');

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

router.get('/hesaplarim', async (req, res) => {
    if (!req.session || !req.session.user) {
        return res.redirect('/');
    }
    try {
        const conn = await mysql.createConnection(getTenantDbConfig(req.session.user.dbName));
        const [hesaplar] = await conn.execute("SELECT * FROM hesapkarti ORDER BY id ASC");
        await conn.end();
        res.render('finans/hesaplarim', {
            user: req.session.user,
            hesaplar: hesaplar,
            error: null
        });
    } catch (error) {
        res.render('finans/hesaplarim', {
            user: req.session.user,
            hesaplar: [],
            error: 'Hesaplar alınamadı'
        });
    }
});
// Homepage sayfası route
router.get('/anasayfa', (req, res) => {
    res.render('anasayfa', { error: null });
});

router.get('/cari_hesap_ekstresi', (req, res) => {
    res.render('cari/cariekstre', { error: null });
});





router.get('/irsaliye', irsaliyeController.gelenIrsaliyeler);






router.get('/ceklistesi', (req, res) => {
    res.render('finans/cekler', { error: null });
});




module.exports = router;
