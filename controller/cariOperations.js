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

// Örnek veri ekleme fonksiyonu
async function addSampleData(conn) {
    try {
        // Örnek cari ekle
        const [cariResult] = await conn.execute(`
            INSERT IGNORE INTO cariler (carikodu, unvan, aktif, il, ilce, adres, bakiye, kaydedenkullanicikayitno)
            VALUES ('CARI001', 'ABC Ticaret Ltd. Şti.', 1, 'İstanbul', 'Kadıköy', 'Test Adres', 0, 1)
        `);
        
        const cariId = cariResult.insertId || 1;

        // Örnek hareketler ekle
        const sampleHareketler = [
            {
                cari_id: cariId,
                hareket_turu_id: 1, // Alış
                depo_id: 1, // Ana Depo
                belge_no: 'ALI-2024-001',
                tarih: '2024-01-01',
                giris_miktar: 100,
                cikis_miktar: 0,
                birim_fiyat: 150.00,
                aciklama: 'Yıllık stok alımı'
            },
            {
                cari_id: cariId,
                hareket_turu_id: 2, // Satış
                depo_id: 1,
                belge_no: 'SAT-2024-001',
                tarih: '2024-01-05',
                giris_miktar: 0,
                cikis_miktar: 20,
                birim_fiyat: 180.00,
                aciklama: 'Perakende satış'
            },
            {
                cari_id: cariId,
                hareket_turu_id: 3, // Aktarma
                depo_id: 1, // Şube Depo
                belge_no: 'AKT-2024-001',
                tarih: '2024-01-10',
                giris_miktar: 30,
                cikis_miktar: 30,
                birim_fiyat: 150.00,
                aciklama: 'Depo aktarımı'
            }
        ];

        for (const hareket of sampleHareketler) {
            const toplamTutar = (hareket.giris_miktar + hareket.cikis_miktar) * hareket.birim_fiyat;
            
            // Son bakiyeyi hesapla
            const [sonBakiye] = await conn.execute(`
                SELECT bakiye FROM cari_hareketler 
                WHERE cari_id = ? 
                ORDER BY tarih DESC, id DESC 
                LIMIT 1
            `, [hareket.cari_id]);
            
            const oncekiBakiye = sonBakiye.length > 0 ? sonBakiye[0].bakiye : 0;
            const yeniBakiye = oncekiBakiye + hareket.giris_miktar - hareket.cikis_miktar;

            await conn.execute(`
                INSERT IGNORE INTO cari_hareketler 
                (cari_id, hareket_turu_id, depo_id, belge_no, tarih, giris_miktar, cikis_miktar, 
                 bakiye, birim_fiyat, toplam_tutar, aciklama, kaydeden_kullanici)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [hareket.cari_id, hareket.hareket_turu_id, hareket.depo_id, hareket.belge_no, 
                 hareket.tarih, hareket.giris_miktar, hareket.cikis_miktar, yeniBakiye, 
                 hareket.birim_fiyat, toplamTutar, hareket.aciklama, 1]);
        }

    } catch (error) {
        console.error('Örnek veri ekleme hatası:', error);
    }
}

// Cari ekstresi sayfası
router.get('/cariekstre', async (req, res) => {
    try {
        const conn = await mysql.createConnection(getTenantDbConfig(req.session.user.dbName));
        
        // Varsayılan verileri getir
        const [hareketler] = await conn.execute(`
            SELECT 
                ch.id,
                ch.tarih,
                ht.tur_adi as hareket_turu,
                ch.belge_no,
                c.unvan as cari_adi,
                d.depo_adi,
                ch.giris_miktar,
                ch.cikis_miktar,
                ch.bakiye,
                ch.birim_fiyat,
                ch.toplam_tutar,
                ch.aciklama
            FROM cari_hareketler ch
            LEFT JOIN hareket_turleri ht ON ch.hareket_turu_id = ht.id
            LEFT JOIN cariler c ON ch.cari_id = c.id
            LEFT JOIN depokarti d ON ch.depo_id = d.id
            ORDER BY ch.tarih DESC
            LIMIT 50
        `);

        const [depolar] = await conn.execute('SELECT * FROM depokarti');
        const [hareketTurleri] = await conn.execute('SELECT * FROM hareket_turleri WHERE aktif = 1');

        await conn.end();

        res.render('cari/cariekstre', {
            user: req.session.user,
            hareketler: hareketler,
            depolar: depolar,
            hareketTurleri: hareketTurleri
        });

    } catch (error) {
        console.error('Cari ekstresi yüklenemedi:', error);
        res.render('cari/cariekstre', {
            user: req.session.user,
            hareketler: [],
            depolar: [],
            hareketTurleri: [],
            error: 'Cari ekstresi yüklenemedi'
        });
    }
});

// Cari hareket arama/filtreleme
router.post('/cariekstre/search', async (req, res) => {
    try {
        const conn = await mysql.createConnection(getTenantDbConfig(req.session.user.dbName));
        
        const {
            cari_arama,
            hareket_turu,
            depo_id,
            baslangic_tarih,
            bitis_tarih,
            baslangic_bakiye,
            bitis_bakiye,
            siralama
        } = req.body;

        let whereConditions = [];
        let params = [];

        if (cari_arama) {
            whereConditions.push('(c.carikodu LIKE ? OR c.unvan LIKE ?)');
            params.push(`%${cari_arama}%`, `%${cari_arama}%`);
        }

        if (hareket_turu) {
            whereConditions.push('ht.tur_kodu = ?');
            params.push(hareket_turu);
        }

        if (depo_id) {
            whereConditions.push('ch.depo_id = ?');
            params.push(depo_id);
        }

        if (baslangic_tarih && bitis_tarih) {
            whereConditions.push('ch.tarih BETWEEN ? AND ?');
            params.push(baslangic_tarih, bitis_tarih);
        }

        if (baslangic_bakiye !== undefined && baslangic_bakiye !== '') {
            whereConditions.push('ch.bakiye >= ?');
            params.push(baslangic_bakiye);
        }

        if (bitis_bakiye !== undefined && bitis_bakiye !== '') {
            whereConditions.push('ch.bakiye <= ?');
            params.push(bitis_bakiye);
        }

        let orderBy = 'ch.tarih DESC';
        if (siralama === 'type') {
            orderBy = 'ht.tur_adi ASC';
        } else if (siralama === 'quantity') {
            orderBy = 'ABS(ch.giris_miktar + ch.cikis_miktar) DESC';
        }

        const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';

        const [hareketler] = await conn.execute(`
            SELECT 
                ch.id,
                ch.tarih,
                ht.tur_adi as hareket_turu,
                ht.tur_kodu,
                ch.belge_no,
                c.unvan as cari_adi,
                d.depo_adi,
                ch.giris_miktar,
                ch.cikis_miktar,
                ch.bakiye,
                ch.birim_fiyat,
                ch.toplam_tutar,
                ch.aciklama
            FROM cari_hareketler ch
            LEFT JOIN hareket_turleri ht ON ch.hareket_turu_id = ht.id
            LEFT JOIN cariler c ON ch.cari_id = c.id
            LEFT JOIN depokarti d ON ch.depo_id = d.id
            ${whereClause}
            ORDER BY ${orderBy}
            LIMIT 100
        `, params);

        // Özet bilgileri hesapla
        const toplamGiris = hareketler.reduce((sum, h) => {
            const miktar = parseFloat(h.giris_miktar) || 0;
            return sum + miktar;
        }, 0);
        const toplamCikis = hareketler.reduce((sum, h) => {
            const miktar = parseFloat(h.cikis_miktar) || 0;
            return sum + miktar;
        }, 0);
        const mevcutStok = hareketler.length > 0 ? (parseFloat(hareketler[0].bakiye) || 0) : 0;
        const hareketSayisi = hareketler.length;
        const stokDegeri = hareketler.reduce((sum, h) => {
            const tutar = parseFloat(h.toplam_tutar) || 0;
            return sum + tutar;
        }, 0);

        await conn.end();

        res.json({
            success: true,
            hareketler: hareketler,
            ozet: {
                toplamGiris,
                toplamCikis,
                mevcutStok,
                hareketSayisi,
                stokDegeri
            }
        });

    } catch (error) {
        console.error('Cari hareket arama hatası:', error);
        console.error('Hata detayı:', error.message);
        console.error('Stack trace:', error.stack);
        
        // Daha detaylı hata mesajı
        let errorMessage = 'Arama sırasında hata oluştu';
        if (error.code === 'ER_NO_SUCH_TABLE') {
            errorMessage = 'Veritabanı tabloları bulunamadı. Lütfen veritabanı yapısını kontrol edin.';
        } else if (error.code === 'ECONNREFUSED') {
            errorMessage = 'Veritabanı bağlantısı kurulamadı.';
        } else if (error.code === 'ER_ACCESS_DENIED_ERROR') {
            errorMessage = 'Veritabanı erişim hatası.';
        }
        
        res.status(500).json({ 
            success: false, 
            message: errorMessage,
            error: error.message
        });
    }
});

// Yeni cari hareket ekleme
router.post('/cariekstre/hareket', async (req, res) => {
    try {
        const conn = await mysql.createConnection(getTenantDbConfig(req.session.user.dbName));
        
        const {
            cari_id,
            hareket_turu_id,
            depo_id,
            belge_no,
            tarih,
            giris_miktar,
            cikis_miktar,
            birim_fiyat,
            aciklama
        } = req.body;

        const kullaniciId = req.session.user.id;
        
        // Miktarları sayıya çevir
        const girisMiktar = parseFloat(giris_miktar) || 0;
        const cikisMiktar = parseFloat(cikis_miktar) || 0;
        const birimFiyat = parseFloat(birim_fiyat) || 0;
        const toplamTutar = (girisMiktar + cikisMiktar) * birimFiyat;

        // Son bakiyeyi al
        const [sonBakiye] = await conn.execute(`
            SELECT bakiye FROM cari_hareketler 
            WHERE cari_id = ? 
            ORDER BY tarih DESC, id DESC 
            LIMIT 1
        `, [cari_id]);

        const oncekiBakiye = sonBakiye.length > 0 ? sonBakiye[0].bakiye : 0;
        const yeniBakiye = oncekiBakiye + girisMiktar - cikisMiktar;

        // Yeni hareketi ekle
        await conn.execute(`
            INSERT INTO cari_hareketler 
            (cari_id, hareket_turu_id, depo_id, belge_no, tarih, giris_miktar, cikis_miktar, 
             bakiye, birim_fiyat, toplam_tutar, aciklama, kaydeden_kullanici)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [cari_id, hareket_turu_id, depo_id, belge_no, tarih, girisMiktar, cikisMiktar,
             yeniBakiye, birimFiyat, toplamTutar, aciklama, kullaniciId]);

        await conn.end();
        res.json({ success: true });

    } catch (error) {
        console.error('Cari hareket ekleme hatası:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Hareket eklenirken hata oluştu' 
        });
    }
});

// Cari hareket silme
router.delete('/cariekstre/hareket/:id', async (req, res) => {
    try {
        const conn = await mysql.createConnection(getTenantDbConfig(req.session.user.dbName));
        
        await conn.execute('DELETE FROM cari_hareketler WHERE id = ?', [req.params.id]);
        
        await conn.end();
        res.json({ success: true });

    } catch (error) {
        console.error('Cari hareket silme hatası:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Hareket silinirken hata oluştu' 
        });
    }
});

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
