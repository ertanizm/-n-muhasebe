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


// Depoları listele
router.get('/depolar', async (req, res) => {
    try {
        const conn = await mysql.createConnection(getTenantDbConfig(req.session.user.dbName));

        const [depolar] = await conn.execute("SELECT * FROM depokarti ORDER BY id ASC");

        res.render('stok/depolar', {
            user: req.session.user,
            depolar: depolar,
        });

    }
    catch (error) {
        console.error('Depo listesi alınamadı:', error);
        res.render('stok/depolar', {
            user: req.session.user,
            depolar: [],
            error: 'Depo listesi alınamadı'
        });
    }
});

// Yeni depo ekle veya güncelle
router.post('/depolar', async (req, res) => {
    const conn = await mysql.createConnection(getTenantDbConfig(req.session.user.dbName));
const kullaniciId = req.session.user.id;

    try {
const {
    id, depo_kodu, depo_adi
} = req.body;

if (id) {
    // Update
    await conn.execute(
        `UPDATE depokarti SET 
            depo_kodu = ?, 
            depo_adi = ?,
            guncelleyenkullanicikayitno = ?
         WHERE id = ?`,
        [
            depo_kodu, depo_adi,kullaniciId,id
        ]
    );
} else {
    // Insert
    await conn.execute(
        `INSERT INTO depokarti (
            depo_kodu, depo_adi,guncelleyenkullanicikayitno,kaydedenkullanicikayitno
        ) VALUES (?, ?, ?, ?)`,
        [
            depo_kodu, depo_adi,kullaniciId,kullaniciId
        ]
    );
}

        await conn.end();
        res.json({ success: true });
    } catch (error) {
        console.error('Depo işlemi başarısız:', error);
        res.status(500).json({ success: false, message: 'Depo işlemi sırasında hata oluştu' });
    }
});

// Depo silme
router.delete('/depolar/:id', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ success: false, message: 'Oturum geçersiz' });
    }
    try {
        const conn = await mysql.createConnection(getTenantDbConfig(req.session.user.dbName));
        await conn.execute("DELETE FROM depokarti WHERE id = ?", [req.params.id]);
        await conn.end();
        res.json({ success: true });
    } catch (error) {
        console.error('Depo silme başarısız:', error);
        res.status(500).json({ success: false, message: 'Depo silinirken hata oluştu' });
    }
});

module.exports = router; 