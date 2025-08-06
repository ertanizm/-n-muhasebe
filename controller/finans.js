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

                //CEKLER
//Cek Listeleme
router.get('/cekler', async (req, res) => {
    try {
        const conn = await mysql.createConnection(getTenantDbConfig(req.session.user.dbName));
        
        // Çekleri çek (cari ve hesap adları ile birlikte)
        const [cekler] = await conn.execute(`
            SELECT c.*, 
                cariler.unvan as cari_adi,
                hesap.tanimi as hesap_adi,
                DATE_FORMAT(c.vade, '%Y-%m-%d') as vade_formatted
                  FROM cekler c
                LEFT JOIN cariler ON c.cari_id = cariler.id
                LEFT JOIN hesapkarti hesap ON c.kasa_banka_id = hesap.id
                ORDER BY c.id ASC
        `);
        
        // Cari listesini çek
        const [cariler] = await conn.execute("SELECT id, unvan,carikodu FROM cariler ORDER BY id ASC");
        
        // Hesap listesini çek (kasa/banka seçimi için)
        const [hesaplar] = await conn.execute("SELECT id, tanimi FROM hesapkarti ORDER BY tanimi ASC");
        
        await conn.end();
    
        res.render('finans/cekler', {
            user: req.session.user,
            cekler: cekler,
            cariler: cariler,
            hesaplar: hesaplar
        });
    
    } catch (error) {
        console.error('Çek listesi alınamadı:', error);
        res.render('finans/cekler', {
            user: req.session.user,
            cekler: [],
            cariler: [],
            hesaplar: [],
            error: 'Çek listesi alınamadı'
        });
    }
});
    
    //Çek ekleme ve güncelleme
    router.post('/cekler', async (req, res) => {
        try {
            const conn = await mysql.createConnection(getTenantDbConfig(req.session.user.dbName));
        const {
            id,cari_id,kasa_banka_id,cek_no,vade,tutar,islem_tipi,durum,aciklama
        } = req.body;
        let giris_miktar = 0;
        let cikis_miktar = 0;
        let cari_islem_tipi = 0;
        const kullaniciId = req.session.user.id;
        if (islem_tipi == 0) {
             giris_miktar = tutar;
             cari_islem_tipi =1;
        }else if(islem_tipi == 1){
             cikis_miktar =tutar;
             cari_islem_tipi =2;
        }
        if (id) {
            // Update
            console.log(cari_id,kasa_banka_id,cek_no,vade,tutar,islem_tipi,durum,aciklama,kullaniciId,kullaniciId);

            await conn.execute(
                `UPDATE cekler SET 
                    cari_id = ?,
                    kasa_banka_id = ?,
                    cek_no = ?,
                    vade = ?,
                    tutar = ?,
                    islem_tipi = ?,
                    durum = ?,
                    aciklama = ?,
                    guncelleyenkullanicikayitno = ?
                WHERE id = ?`,
                [cari_id,kasa_banka_id,cek_no,vade,tutar,islem_tipi,durum,aciklama,kullaniciId,id]
            );
        }
        else {
            // Insert

            console.log(cari_id,cari_islem_tipi,1,cek_no,Date.now,giris_miktar,cikis_miktar,giris_miktar+cikis_miktar,aciklama,kullaniciId);
            await conn.execute(
                `INSERT INTO cekler (
                    cari_id,kasa_banka_id,cek_no,vade,tutar,islem_tipi,durum,aciklama,kaydeden_kullanici,guncelleyenkullanicikayitno
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [cari_id,kasa_banka_id,cek_no,vade,tutar,islem_tipi,durum,aciklama,kullaniciId,kullaniciId]
            );
            await conn.execute(
                `INSERT INTO cari_hareketler (
                cari_id,hareket_turu_id,depo_id,belge_no,tarih,giris_miktar,cikis_miktar,bakiye,aciklama,kaydeden_kullanici
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [cari_id,cari_islem_tipi,1,cek_no,vade,giris_miktar,cikis_miktar,giris_miktar+cikis_miktar,aciklama,kullaniciId]
            );
        }
            await conn.end();
            res.json({ success: true, message: 'Çek işlemi başarılı' });
        } catch (error) {
            console.error('Çek işlemi başarısız:', error);
            res.status(500).json({ success: false, message: 'Çek işlemi sırasında hata oluştu: ' + error.message });
        }
    });

    //Çek Silme
    router.delete('/cekler/:id', async (req, res) => {
        if (!req.session.user) {
            return res.status(401).json({ success: false, message: 'Oturum geçersiz' });
        }
        try {
            const conn = await mysql.createConnection(getTenantDbConfig(req.session.user.dbName));
            await conn.execute("DELETE FROM cekler WHERE id = ?", [req.params.id]);
            await conn.end();
            res.json({ success: true });
        } catch (error) {
            console.error('Çek silme başarısız:', error);
            res.status(500).json({ success: false, message: 'Çek silinirken hata oluştu' });
        }
    });

module.exports = router;
