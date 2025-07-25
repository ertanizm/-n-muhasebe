const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');
const path = require('path');
const { getMasterDbConfig, getTenantDbConfig } = require('./db');

// Ensure views directory is correctly set
router.use((req, res, next) => {
    res.locals.viewPath = path.join(__dirname, '../views');
    next();
});

// Auth middleware for cari routes
const authMiddleware = (req, res, next) => {
    if (!req.session || !req.session.user) {
        if (req.xhr || req.headers.accept.indexOf('json') > -1) {
            return res.status(401).json({ success: false, message: 'Oturum geçersiz' });
        }
        return res.redirect('/');
    }
    next();
};

// Apply auth middleware to all routes
router.use(authMiddleware);

// Müşteri listesi
router.get('/musteriler', async (req, res) => {
    try {
        const conn = await mysql.createConnection(getTenantDbConfig(req.session.user.dbName));

        const [customers] = await conn.execute(
            "SELECT * FROM cariler ORDER BY id ASC"
        );

        await conn.end();
        res.render('cari/musteriler', {
            user: req.session.user,
            customers: customers
        });

    } catch (error) {
        console.error('Müşteri listesi alınamadı:', error);
        res.render('cari/musteriler', {
            user: req.session.user,
            customers: [],
            error: 'Müşteri listesi alınamadı'
        });
    }
});

// Müşteri ekleme/güncelleme - POST endpoint
router.post('/musteriler', async (req, res) => {
    try {
        const conn = await mysql.createConnection(getTenantDbConfig(req.session.user.dbName));

        const {
            id, carikodu, unvan, aktif, il, ilce, adres, resmi, vadeopsiyonu, bakiye,
            efatura, efaturasenaryo, efaturalicietiketi,
            vergi_dairesi, vergi_no, telefon, email, type
        } = req.body;

        // Kullanıcı id'si
        const kullaniciId = req.session.user.id;

        const resmiInt = (resmi === '' || resmi === undefined) ? null : Number(resmi);
        const bakiyeInt = (bakiye === '' || bakiye === undefined) ? null : Number(bakiye);
        const typeInt = (typeof type === 'undefined' || type === '' || isNaN(Number(type))) ? 0 : Number(type);

        if (id) {
            // Update existing customer
            await conn.execute(
                `UPDATE cariler SET 
                    carikodu=?, unvan=?, aktif=?, il=?, ilce=?, adres=?, resmi=?, vadeopsiyonu=?, bakiye=?,
                    guncelleyenkullanicikayitno=?, efatura=?, efaturasenaryo=?, efaturalicietiketi=?,
                    vergi_dairesi=?, vergi_no=?, telefon=?, email=?, type=?
                WHERE id = ?`,
                [carikodu, unvan, aktif, il, ilce, adres, resmiInt, vadeopsiyonu, bakiyeInt,
                 kullaniciId, efatura, efaturasenaryo, efaturalicietiketi,
                 vergi_dairesi, vergi_no, telefon, email, typeInt, id]
            );
        } else {
            // Add new customer
            await conn.execute(
                `INSERT INTO cariler 
                    (carikodu, unvan, aktif, il, ilce, adres, resmi, vadeopsiyonu, bakiye, borc, alacak, kaydedenkullanicikayitno, efatura, efaturasenaryo, efaturalicietiketi, vergi_dairesi, vergi_no, telefon, email, type)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [carikodu, unvan, aktif, il, ilce, adres, resmiInt, vadeopsiyonu, bakiyeInt, 0, 0, kullaniciId, efatura, efaturasenaryo, efaturalicietiketi, vergi_dairesi, vergi_no, telefon, email, typeInt]
            );
        }

        await conn.end();
        res.json({ success: true });

    } catch (error) {
        console.error('Müşteri işlemi başarısız:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Müşteri işlemi sırasında hata oluştu' 
        });
    }
});

// Müşteri silme
router.delete('/musteriler/:id', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ success: false, message: 'Oturum geçersiz' });
    }

    try {
        const conn = await mysql.createConnection(getTenantDbConfig(req.session.user.dbName));

        await conn.execute(
            "DELETE FROM cariler WHERE id = ?",
            [req.params.id]
        );

        await conn.end();
        res.json({ success: true });

    } catch (error) {
        console.error('Müşteri silme başarısız:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Müşteri silinirken hata oluştu' 
        });
    }
});

// CSV export
router.get('/musteriler/export', async (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }

    try {
        const conn = await mysql.createConnection(getTenantDbConfig(req.session.user.dbName));

        const [customers] = await conn.execute(
            "SELECT * FROM cariler ORDER BY unvan ASC"
        );

        await conn.end();

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=musteriler.csv');

        const csvContent = [
            ['ID', 'Cari Kodu', 'Unvan', 'Aktif', 'İl', 'İlçe', 'Adres', 'Resmi', 'Vade Opsiyonu', 'Bakiye', 'Alacak', 'Borç', 'Günc. Kullanıcı', 'Kaydeden Kullanıcı', 'e-Fatura', 'e-Fatura Senaryo', 'e-Fatura Etiketi', 'Vergi Dairesi', 'Vergi No', 'Telefon', 'Email'],
            ...customers.map(c => [
                c.id, c.carikodu, c.unvan, c.aktif, c.il, c.ilce, c.adres, c.resmi, c.vadeopsiyonu, c.bakiye, c.alacak, c.borc,
                c.guncelleyenkullanicikayitno, c.kaydedenkullanicikayitno, c.efatura, c.efaturasenaryo, c.efaturalicietiketi,
                c.vergi_dairesi, c.vergi_no, c.telefon, c.email
            ])
        ].map(row => row.join(',')).join('\n');

        res.send('\uFEFF' + csvContent); // UTF-8 BOM ekle

    } catch (error) {
        console.error('CSV export hatası:', error);
        res.status(500).send('CSV dosyası oluşturulamadı');
    }
});

module.exports = router;
