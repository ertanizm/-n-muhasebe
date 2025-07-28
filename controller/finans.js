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
// router.get('/hesaplarim/hareketler/:bankaId', async (req, res) => {
//     const bankaId = req.params.bankaId;
//     try {
//         const conn = await mysql.createConnection(getTenantDbConfig(req.session.user.dbName));
//         // Örnek sorgu: hareketler tablosu varsa ona göre düzenle!
//         const [rows] = await conn.execute(
//             "SELECT tarih, islem, kullanici, hesap, aciklama, borc, alacak FROM hesap_hareketleri WHERE banka_id = ? ORDER BY tarih DESC",
//             [bankaId]
//         );
//         await conn.end();
//         res.json(rows);
//     } catch (err) {
//         res.json([]);
//     }
// });
// Hesaplarım ana sayfa (listeleme)
/*router.get('/hesaplarim', async (req, res) => {
    try {
        const conn = await mysql.createConnection(getTenantDbConfig(req.session.user.dbName));
        const [hesaplar] = await conn.execute("SELECT * FROM hesapkarti ORDER BY id ASC");
        await conn.end();
        res.render('finans/hesaplarim', {
            user: req.session.user,
            hesaplar: hesaplar,   // <-- Burası önemli!
            error: null
        });
    } catch (error) {
        res.render('finans/hesaplarim', {
            user: req.session.user,
            hesaplar: [],
            error: 'Hesaplar alınamadı'
        });
    }
});*/

// Hesap ekleme
router.post('/hesap-ekle', async (req, res) => {
    console.log('Gelen veri:', req.body); // Bunu ekle
    try {
        const conn = await mysql.createConnection(getTenantDbConfig(req.session.user.dbName));
        const { tanimi, parabirimi, guncelbakiye, posbankasi, tip } = req.body;
        if (!tanimi || !parabirimi || guncelbakiye === undefined || tip === undefined) {
            return res.status(400).json({ success: false, message: 'Eksik bilgi!' });
        }
        await conn.execute(
            `INSERT INTO hesapkarti (tanimi, parabirimi, guncelbakiye, posbankasi, tip) VALUES (?, ?, ?, ?, ?)`,
            [tanimi, parabirimi, guncelbakiye, posbankasi || null, tip]
        );
        await conn.end();
        res.json({ success: true });
    } catch (error) {
        console.error('Hesap ekleme hatası:', error);
        res.status(500).json({ success: false, message: 'Hesap eklenirken hata oluştu' });
    }
});

// Hesap güncelleme
router.put('/hesaplarim/:id', async (req, res) => {
    try {
        const conn = await mysql.createConnection(getTenantDbConfig(req.session.user.dbName));
        const { tanimi, parabirimi, guncelbakiye, posbankasi, tip } = req.body;
        const { id } = req.params;
        if (!id || !tanimi || !parabirimi || guncelbakiye === undefined || tip === undefined) {
            return res.status(400).json({ success: false, message: 'Eksik bilgi!' });
        }
        await conn.execute(
            `UPDATE hesapkarti SET tanimi=?, parabirimi=?, guncelbakiye=?, posbankasi=?, tip=? WHERE id=?`,
            [tanimi, parabirimi, guncelbakiye, posbankasi || null, tip, id]
        );
        await conn.end();
        res.json({ success: true });
    } catch (error) {
        console.error('Hesap güncelleme hatası:', error);
        res.status(500).json({ success: false, message: 'Hesap güncellenirken hata oluştu' });
    }
});

// Hesap silme
router.delete('/hesaplarim/:id', async (req, res) => {
    try {
        const conn = await mysql.createConnection(getTenantDbConfig(req.session.user.dbName));
        const { id } = req.params;
        if (!id) {
            return res.status(400).json({ success: false, message: 'Eksik bilgi!' });
        }
        await conn.execute("DELETE FROM hesapkarti WHERE id = ?", [id]);
        await conn.end();
        res.json({ success: true });
    } catch (error) {
        console.error('Hesap silme hatası:', error);
        res.status(500).json({ success: false, message: 'Hesap silinirken hata oluştu' });
    }
});

module.exports = router;
