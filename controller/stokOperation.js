const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');
const path = require('path');
const { getTenantDbConfig } = require('./db');

// Views path ayarı (gerekirse)
router.use((req, res, next) => {
    res.locals.viewPath = path.join(__dirname, '../views');
    next();
});

// Auth middleware
const authMiddleware = (req, res, next) => {
    if (!req.session || !req.session.user) {
        if (req.xhr || req.headers.accept.indexOf('json') > -1) {
            return res.status(401).json({ success: false, message: 'Oturum geçersiz' });
        }
        return res.redirect('/');
    }
    next();
};
router.use(authMiddleware);

// Stok listesi
router.get('/stoklar', async (req, res) => {
    try {
        const conn = await mysql.createConnection(getTenantDbConfig(req.session.user.dbName));
        const [stoklar] = await conn.execute("SELECT * FROM stoklar ORDER BY id ASC");
        await conn.end();
        res.render('stok/stoklar', {
            user: req.session.user,
            stoklar: stoklar
        });
    } catch (error) {
        console.error('Stok listesi alınamadı:', error);
        res.render('stok/stoklar', {
            user: req.session.user,
            stoklar: [],
            error: 'Stok listesi alınamadı'
        });
    }
});

// Stok ekleme/güncelleme
router.post('/stoklar', async (req, res) => {
    try {
        const conn = await mysql.createConnection(getTenantDbConfig(req.session.user.dbName));
        const {
            id, stok_kodu, stok_adi, birim, miktar
        } = req.body;
        if (id) {
            // Update
            await conn.execute(
                `UPDATE stoklar SET stok_kodu=?, stok_adi=?, birim=?, miktar=? WHERE id = ?`,
                [stok_kodu, stok_adi, birim, miktar, id]
            );
        } else {
            // Insert
            await conn.execute(
                `INSERT INTO stoklar (stok_kodu, stok_adi, birim, miktar) VALUES (?, ?, ?, ?)`,
                [stok_kodu, stok_adi, birim, miktar]
            );
        }
        await conn.end();
        res.json({ success: true });
    } catch (error) {
        console.error('Stok işlemi başarısız:', error);
        res.status(500).json({ success: false, message: 'Stok işlemi sırasında hata oluştu' });
    }
});

// Stok silme
router.delete('/stoklar/:id', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ success: false, message: 'Oturum geçersiz' });
    }
    try {
        const conn = await mysql.createConnection(getTenantDbConfig(req.session.user.dbName));
        await conn.execute("DELETE FROM stoklar WHERE id = ?", [req.params.id]);
        await conn.end();
        res.json({ success: true });
    } catch (error) {
        console.error('Stok silme başarısız:', error);
        res.status(500).json({ success: false, message: 'Stok silinirken hata oluştu' });
    }
});

module.exports = router;
