const express = require('express');
const csrf = require('csurf');
const router = express.Router();
const path = require('path');
const mysql = require('mysql2/promise');
const { getTenantDbConfig } = require('./controller/db');
const irsaliyeController = require('./controller/irsaliye');
const cariOperations = require('./controller/cariOperations');

// Auth middleware for page routes
const authMiddleware = (req, res, next) => {
    if (!req.session || !req.session.user) {
        return res.redirect('/');
    }
    next();
};

// Auth middleware for API routes
const apiAuthMiddleware = (req, res, next) => {
    if (!req.session || !req.session.user) {
        return res.status(401).json({ success: false, message: 'Oturum geçersiz' });
    }
    next();
};

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

// Cari operations routes
router.use('/cari', cariOperations);

router.get('/irsaliye/gelen', authMiddleware, irsaliyeController.gelenIrsaliyeler);
router.get('/irsaliye/giden', authMiddleware, irsaliyeController.gidenIrsaliyeler);

// API endpointleri - Auth middleware ile korumalı
router.get('/api/cariler', apiAuthMiddleware, irsaliyeController.getCariler);
router.get('/api/depolar', apiAuthMiddleware, irsaliyeController.getDepolar);
router.get('/api/stoklar', apiAuthMiddleware, irsaliyeController.getStoklar);
router.post('/api/irsaliye', apiAuthMiddleware, irsaliyeController.createIrsaliye);
router.post('/api/add-test-data', apiAuthMiddleware, irsaliyeController.addTestData);

router.get('/ceklistesi', (req, res) => {
    res.render('finans/cekler', { error: null });
});

module.exports = router;
