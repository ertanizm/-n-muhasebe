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

                //STOK İŞLEMLERİ


// Stok listesi
router.get('/stoklar', async (req, res) => {
    try {
        const conn = await mysql.createConnection(getTenantDbConfig(req.session.user.dbName));
        
        // Stokları çek
        const [stoklar] = await conn.execute("SELECT * FROM stoklar ORDER BY id ASC");
        
        // Grup verilerini çek
        const [gruplar] = await conn.execute("SELECT id, grup_adi FROM stokgrupkarti ORDER BY grup_adi ASC");
        
        // Vergi verilerini çek
        const [vergiler] = await conn.execute("SELECT id, vergikodu FROM vergikarti ORDER BY id ASC");
        
        // Depoları verilerini çek
        const [depolar] = await conn.execute("SELECT id ,depo_kodu,depo_adi FROM depokarti ORDER BY id ASC");

        await conn.end();
        
        // Birim değerlerini metne çevir
        const birimTexts = ['Adet', 'Kilogram', 'Litre', 'Paket','Metre','Koli','Kutu'];
        const stokTexts = ['Ürün', 'Hizmet'];

        stoklar.forEach(stok => {
            stok.birimText = birimTexts[stok.birim] || 'Bilinmeyen';
            stok.stokText = stokTexts[stok.stoktipi] || 'Bilinmeyen';

            // Tarihi formatla
            if (stok.kayittarihi) {
                const tarih = new Date(stok.kayittarihi);
                stok.kayittarihiFormatted = tarih.toLocaleDateString('tr-TR', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit'
                });
            }
        });
        
        res.render('stok/stoklar', {
            user: req.session.user,
            stoklar: stoklar,
            gruplar: gruplar,
            vergiler: vergiler,
            depolar : depolar
        });
    } catch (error) {
        console.error('Stok listesi alınamadı:', error);
        res.render('stok/stoklar', {
            user: req.session.user,
            stoklar: [],
            gruplar: [],
            vergiler: [],
            depolar:[],
            error: 'Stok listesi alınamadı'
        });
    }
});

// Stok ekleme/güncelleme
router.post('/stoklar', async (req, res) => {
    try {
        const conn = await mysql.createConnection(getTenantDbConfig(req.session.user.dbName));
const {
    id, stok_kodu, stok_adi, birim, aktifbarkod,
    guncelleyenkullanicikayitno, kaydedenkullanicikayitno,
    fiyat1, fiyat2, fiyat3, stoktipi, aktif,
    miktar, kayittarihi, 
    grupkayitno, 
    vergikayitno,
    depokayitno
} = req.body;

const processedGrupkayitno = (grupkayitno && grupkayitno.trim() !== '') ? grupkayitno : null;
const processedVergikayitno = (vergikayitno && vergikayitno.trim() !== '') ? vergikayitno : null;
const processedDepokayitno = (depokayitno && depokayitno.trim() !== '') ? depokayitno:null;
const kullaniciId = req.session.user.id;
console.log("Processed values:", processedVergikayitno, processedGrupkayitno);

if (id) {
    // Update
    await conn.execute(
        `UPDATE stoklar SET 
            stok_kodu = ?, 
            stok_adi = ?, 
            birim = ?, 
            aktifbarkod = ?, 
            guncelleyenkullanicikayitno = ?, 
            kaydedenkullanicikayitno = ?,
            fiyat1 = ?, 
            fiyat2 = ?, 
            fiyat3 = ?, 
            stoktipi = ?, 
            aktif = ?, 
            miktar = ?, 
            grupkayitno = ?, 
            vergikayitno = ?,
            depokayitno = ?
         WHERE id = ?`,
        [
            stok_kodu, stok_adi, birim, aktifbarkod,
            kullaniciId,kullaniciId,
            fiyat1, fiyat2, fiyat3,
            stoktipi, aktif,
            miktar, 
            processedGrupkayitno, processedVergikayitno,processedDepokayitno,
            id
        ]
    );
} else {
    // Insert
    await conn.execute(
        `INSERT INTO stoklar (
            stok_kodu, stok_adi, birim, aktifbarkod, 
            guncelleyenkullanicikayitno, kaydedenkullanicikayitno, 
            fiyat1, fiyat2, fiyat3, 
            stoktipi, aktif, miktar,
            grupkayitno, vergikayitno,depokayitno
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            stok_kodu, stok_adi, birim, aktifbarkod,
            kullaniciId, kullaniciId,
            fiyat1, fiyat2, fiyat3,
            stoktipi, aktif, miktar,
            processedGrupkayitno, processedVergikayitno,processedDepokayitno
        ]
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


                //GRUP İŞLEMLERİ

//Grup Listesi
router.get('/stokgrup', async (req, res) => {
    try {
        const conn = await mysql.createConnection(getTenantDbConfig(req.session.user.dbName));
        
        // Stokları çek
        const [stokgrup] = await conn.execute("SELECT * FROM stokgrupkarti ORDER BY id ASC");
        
        await conn.end();
      
        
        res.render('stok/stokgrup', {
            user: req.session.user,
            gruplar: stokgrup
        });
    } catch (error) {
        console.error('Grup listesi alınamadı:', error);
        res.render('stok/stokgrup', {
            user: req.session.user,
            stokgrup: [],
            error: 'Grup listesi alınamadı'
        });
    }
});

//Grup ekleme ve güncelleme
router.post('/stokgrup', async (req, res) => {
    try {
        const conn = await mysql.createConnection(getTenantDbConfig(req.session.user.dbName));
    const {
        id, grup_kodu, grup_adi
    } = req.body;


const kullaniciId = req.session.user.id;

if (id) {
    // Update
    await conn.execute(
        `UPDATE stokgrupkarti SET 
            grup_kodu = ?, 
            grup_adi = ?,
            kaydedenKullaniciKayitNo = ?,
            guncelleyenKullaniciKayitNo = ?
         WHERE id = ?`,
        [
            grup_kodu, grup_adi,kullaniciId,kullaniciId,id
        ]
    );
} else {
    // Insert
    await conn.execute(
        `INSERT INTO stokgrupkarti (
            grup_kodu, grup_adi,kaydedenKullaniciKayitNo,guncelleyenKullaniciKayitNo
        ) VALUES (?, ?, ?, ?)`,
        [
            grup_kodu, grup_adi,kullaniciId,kullaniciId
        ]
    );
}

        await conn.end();
        res.json({ success: true });
    } catch (error) {
        console.error('Grup işlemi başarısız:', error);
        res.status(500).json({ success: false, message: 'Grup işlemi sırasında hata oluştu' });
    }
});

//Grup Silme
router.delete('/stokgrup/:id', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ success: false, message: 'Oturum geçersiz' });
    }
    try {
        const conn = await mysql.createConnection(getTenantDbConfig(req.session.user.dbName));
        await conn.execute("DELETE FROM stokgrupkarti WHERE id = ?", [req.params.id]);
        await conn.end();
        res.json({ success: true });
    } catch (error) {
        console.error('Grup silme başarısız:', error);
        res.status(500).json({ success: false, message: 'Grup silinirken hata oluştu' });
    }
});

                //VERGİ İŞLEMLERİ

//Vergi Listesi
router.get('/vergi', async (req, res) => {
    try {
        const conn = await mysql.createConnection(getTenantDbConfig(req.session.user.dbName));
        
        // Stokları çek
        const [vergi] = await conn.execute("SELECT * FROM vergikarti ORDER BY id ASC");
        
        await conn.end();
      
        
        res.render('stok/vergi', {
            user: req.session.user,
            vergi: vergi
        });
    } catch (error) {
        console.error('Grup listesi alınamadı:', error);
        res.render('stok/vergi', {
            user: req.session.user,
            stokgrup: [],
            error: 'Grup listesi alınamadı'
        });
    }
});

//Vergi ekleme ve güncelleme
router.post('/vergi', async (req, res) => {
    try {
        const conn = await mysql.createConnection(getTenantDbConfig(req.session.user.dbName));
    const {
        id, vergikodu, birincivergiorani,ikincivergiorani,ucuncuvergiorani,dorduncuvergiorani,guncelleyenkullanicikayitno,kaydedenkullanicikayitno
    } = req.body;


const kullaniciId = req.session.user.id;

if (id) {
    // Update
    await conn.execute(
        `UPDATE vergikarti SET 
            vergikodu = ?, 
            birincivergiorani = ?,
            ikincivergiorani = ?,
            ucuncuvergiorani = ?,
            dorduncuvergiorani = ?,
            guncelleyenkullanicikayitno = ?
         WHERE id = ?`,
        [
            vergikodu,
            birincivergiorani,
            ikincivergiorani,
            ucuncuvergiorani,
            dorduncuvergiorani,
            guncelleyenkullanicikayitno,
            id
        ]
    );
} else {
    // Insert
    await conn.execute(
        `INSERT INTO vergikarti (
            vergikodu,
            birincivergiorani,
            ikincivergiorani,
            ucuncuvergiorani,
            dorduncuvergiorani,
            guncelleyenkullanicikayitno,
            kaydedenkullanicikayitno
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
             vergikodu,
            birincivergiorani,
            ikincivergiorani,
            ucuncuvergiorani,
            dorduncuvergiorani,
            guncelleyenkullanicikayitno,
            kaydedenkullanicikayitno
        ]
    );
}

        await conn.end();
        res.json({ success: true });
    } catch (error) {
        console.error('Grup işlemi başarısız:', error);
        res.status(500).json({ success: false, message: 'Grup işlemi sırasında hata oluştu' });
    }
});

//Vergi Silme
router.delete('/vergi/:id', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ success: false, message: 'Oturum geçersiz' });
    }
    try {
        const conn = await mysql.createConnection(getTenantDbConfig(req.session.user.dbName));
        await conn.execute("DELETE FROM vergikarti WHERE id = ?", [req.params.id]);
        await conn.end();
        res.json({ success: true });
    } catch (error) {
        console.error('Grup silme başarısız:', error);
        res.status(500).json({ success: false, message: 'Grup silinirken hata oluştu' });
    }
});


//Fiyat Listesi
router.get('/fiyatlistesi', async (req, res) => {
    try {
        const conn = await mysql.createConnection(getTenantDbConfig(req.session.user.dbName));
        
        // Stokları grup bilgileriyle birlikte çek
        const [fiyatlistesi] = await conn.execute(`
            SELECT s.*, sg.grup_adi, v.birincivergiorani as vergi_orani
            FROM stoklar s
            LEFT JOIN stokgrupkarti sg ON s.grupkayitno = sg.id
            LEFT JOIN vergikarti v ON s.vergikayitno = v.id
            ORDER BY s.id ASC
        `);
        
        await conn.end();
        
        res.render('stok/fiyatlistesi', {
            user: req.session.user,
            fiyatlistesi: fiyatlistesi
        });
    } catch (error) {
        console.error('Fiyat listesi alınamadı:', error);
        res.render('stok/fiyatlistesi', {
            user: req.session.user,
            fiyatlistesi: [],
            error: 'Fiyat listesi alınamadı'
        });
    }
});

// Tekil stok bilgisi getir
router.get('/stoklar/:id', async (req, res) => {
    try {
        const conn = await mysql.createConnection(getTenantDbConfig(req.session.user.dbName));
        
        const [stoklar] = await conn.execute(`
            SELECT s.*, sg.grup_adi, v.birincivergiorani as vergi_orani
            FROM stoklar s
            LEFT JOIN stokgrupkarti sg ON s.grupkayitno = sg.id
            LEFT JOIN vergikarti v ON s.vergikayitno = v.id
            WHERE s.id = ?
        `, [req.params.id]);
        
        await conn.end();
        
        if (stoklar.length > 0) {
            res.json({ success: true, data: stoklar[0] });
        } else {
            res.json({ success: false, message: 'Stok bulunamadı' });
        }
    } catch (error) {
        console.error('Stok bilgisi alınamadı:', error);
        res.status(500).json({ success: false, message: 'Stok bilgisi alınamadı' });
    }
});

// Fiyat güncelleme
router.post('/fiyatguncelle', async (req, res) => {
    try {
        const conn = await mysql.createConnection(getTenantDbConfig(req.session.user.dbName));
        
        const {
            id, fiyat1, fiyat2, fiyat3, vergi_orani, aciklama
        } = req.body;
        
        const kullaniciId = req.session.user.id;
        
        // Fiyat güncelleme
        await conn.execute(
            `UPDATE stoklar SET 
                fiyat1 = ?, 
                fiyat2 = ?, 
                fiyat3 = ?,
                guncelleyenkullanicikayitno = ?
             WHERE id = ?`,
            [
                fiyat1 || null,
                fiyat2 || null,
                fiyat3 || null,
                kullaniciId,
                id
            ]
        );
        
        // Fiyat geçmişi kaydet (opsiyonel)
        if (aciklama) {
            await conn.execute(
                `INSERT INTO fiyat_gecmisi (
                    stok_id, eski_fiyat1, eski_fiyat2, eski_fiyat3,
                    yeni_fiyat1, yeni_fiyat2, yeni_fiyat3,
                    guncelleyen_kullanici, aciklama, guncelleme_tarihi
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
                [
                    id, null, null, null, fiyat1, fiyat2, fiyat3, kullaniciId, aciklama
                ]
            );
        }
        
        await conn.end();
        res.json({ success: true, message: 'Fiyat başarıyla güncellendi' });
    } catch (error) {
        console.error('Fiyat güncelleme başarısız:', error);
        res.status(500).json({ success: false, message: 'Fiyat güncellenirken hata oluştu' });
    }
});

//Vergi ekleme ve güncelleme


//Stok Ekstresi Listesi
router.get('/stokekstresi', async (req, res) => {
    try {
        const conn = await mysql.createConnection(getTenantDbConfig(req.session.user.dbName));
        
        // Stokları çek
        //const [vergi] = await conn.execute("SELECT * FROM vergikarti ORDER BY id ASC");
        
        await conn.end();
      
        
        res.render('stok/stokekstresi', {
            user: req.session.user,
            //vergi: vergi
        });
    } catch (error) {
        console.error('Grup listesi alınamadı:', error);
        res.render('stok/stokekstresi', {
            user: req.session.user,
            //stokgrup: [],
            error: 'Grup listesi alınamadı'
        });
    }
});

//Depo Transfer Listesi
router.get('/depotransfer', async (req, res) => {
    try {
        const conn = await mysql.createConnection(getTenantDbConfig(req.session.user.dbName));
        
        // Stokları çek
        //const [vergi] = await conn.execute("SELECT * FROM vergikarti ORDER BY id ASC");
        
        await conn.end();
      
        
        res.render('stok/depotransfer', {
            user: req.session.user,
            //vergi: vergi
        });
    } catch (error) {
        console.error('Grup listesi alınamadı:', error);
        res.render('stok/depotransfer', {
            user: req.session.user,
            //stokgrup: [],
            error: 'Grup listesi alınamadı'
        });
    }
});

module.exports = router;

