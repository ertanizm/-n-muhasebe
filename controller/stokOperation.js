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

//Stok Filtre   
router.post('/stoklar/search', async (req, res) => {
    try {
        const conn = await mysql.createConnection(getTenantDbConfig(req.session.user.dbName));
        const {
            stok_arama,
            stok_grup,
            depo,
            baslangic_tarih,
            bitis_tarih,
            baslangic_Bakiye,
            bitis_Bakiye,
            siralama
        } = req.body;

        let whereConditions = [];
        let params = [];

        if (stok_arama) {
            whereConditions.push('(s.stok_adi LIKE ? OR s.stok_kodu LIKE ?)');
            params.push(`%${stok_arama}%`, `%${stok_arama}%`);
        }
        if (stok_grup) {
            whereConditions.push('s.grupkayitno = ?');
            params.push(stok_grup);
        }
        if (depo) {
            whereConditions.push('s.depokayitno = ?');
            params.push(depo);
        }
        if (baslangic_Bakiye && bitis_Bakiye) {
            whereConditions.push('s.fiyat1 BETWEEN ? AND ?');
            params.push(baslangic_Bakiye, bitis_Bakiye);
        }
        if (baslangic_tarih && bitis_tarih) {
            whereConditions.push('s.kayittarihi BETWEEN ? AND ?');
            params.push(baslangic_tarih, bitis_tarih);
        }
        let orderBy = 's.kayittarihi DESC';
        if (siralama === 'type') {
            orderBy = 's.stok_kodu ASC';
        } else if (siralama === 'quantity') {
            orderBy = 's.fiyat1 DESC';
        } else if (siralama === 'amount') {
            orderBy = 's.fiyat1 DESC';
        }

        const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';

        const [stoklar] = await conn.execute(`
            SELECT s.*, 
                sgk.grup_adi as grup_adi,
                dk.depo_adi as depo_adi
            FROM stoklar s
            LEFT JOIN stokgrupkarti sgk ON s.grupkayitno = sgk.id
            LEFT JOIN depokarti dk  ON s.depokayitno = dk.id
            ${whereClause}
            ORDER BY ${orderBy}
            LIMIT 100
        `, params);

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

        await conn.end();
        // const mappedCekler = cekler.map(cek => ({
        //     ...cek,
        //     islem_tipi_text: islemTipiText(cek.islem_tipi),
        //     durum_text: durumText(cek.durum)
        // }));
        res.json({ success: true, stoklar: stoklar });
    } catch (error) {
        console.error('Çek arama hatası:', error);
        res.status(500).json({ success: false, message: 'Çek arama sırasında hata oluştu: ' + error.message });
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

                //DOVİZ İŞLEMLERİ   

//Döviz Listesi
router.get('/doviz', async (req, res) => {
try {
    const conn = await mysql.createConnection(getTenantDbConfig(req.session.user.dbName));
    
    // Stokları çek
    const [doviz] = await conn.execute("SELECT * FROM dovizkarti ORDER BY id ASC");
    
    await conn.end();

    res.render('stok/doviz', {
        user: req.session.user,
        doviz: doviz
    });

} catch (error) {
    console.error('Döviz listesi alınamadı:', error);
    res.render('stok/doviz', {
        user: req.session.user,
        doviz: [],
        error: 'Döviz listesi alınamadı'
    });
}
});

//Döviz ekleme ve güncelleme
router.post('/doviz', async (req, res) => {
    try {
        const conn = await mysql.createConnection(getTenantDbConfig(req.session.user.dbName));
    const {
        id, doviz_kodu, doviz_adi,doviz_kuru,doviz_turu,guncelleyenkullanicikayitno,kaydedenkullanicikayitno
    } = req.body;

    const kullaniciId = req.session.user.id;

    if (id) {
        // Update
        await conn.execute(
            `UPDATE dovizkarti SET 
                doviz_kodu = ?, 
                doviz_adi = ?, 
                doviz_kuru = ?,
                doviz_turu = ?,
                guncelleyenkullanicikayitno = ?
            WHERE id = ?`,
            [doviz_kodu, doviz_adi, doviz_kuru, doviz_turu, kullaniciId, id]
        );
    }
    else {
        // Insert
        await conn.execute(
            `INSERT INTO dovizkarti (
                doviz_kodu, doviz_adi, guncelleyenkullanicikayitno, kaydedenkullanicikayitno,doviz_kuru,doviz_turu
            ) VALUES (?, ?, ?, ?, ?, ?)`,
            [doviz_kodu, doviz_adi, kullaniciId, kullaniciId,doviz_kuru,doviz_turu]
        );
    }
        await conn.end();
        res.json({ success: true, message: 'Döviz işlemi başarılı' });
    } catch (error) {
        console.error('Döviz işlemi başarısız:', error);
        res.status(500).json({ success: false, message: 'Döviz işlemi sırasında hata oluştu: ' + error.message });
    }
});

router.delete('/doviz/:id', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ success: false, message: 'Oturum geçersiz' });
    }
    try {
        const conn = await mysql.createConnection(getTenantDbConfig(req.session.user.dbName));
        await conn.execute("DELETE FROM dovizkarti WHERE id = ?", [req.params.id]);
        await conn.end();
        res.json({ success: true });
    } catch (error) {
        console.error('Döviz silme başarısız:', error);
        res.status(500).json({ success: false, message: 'Döviz silinirken hata oluştu' });
    }
});
        

        //Stok Ekstresi
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
        res.render('stok/vergi', {
            user: req.session.user,
            //stokgrup: [],
            error: 'Grup listesi alınamadı'
        });
    }
});


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
        console.error('Depo transfer listesi alınamadı:', error);
        res.render('stok/depotransfer', {
            user: req.session.user,
            //stokgrup: [],
            error: 'Depo transfer listesi alınamadı'
        });
    }
});


function depoText(val) {
    if (val === 0 || val === "0") return "Alış";
    if (val === 1 || val === "1") return "Çıkış";
    return "Diğer";
}
function stokGrupText(val) {
    if (val === 0 || val === "0") return "Ciro Edildi";
    if (val === 1 || val === "1") return "Tahsil Edildi";
    if (val === 2 || val === "2") return "Portföyde";
    if (val === 3 || val === "3") return "Karşılıksız";
    if (val === 4 || val === "4") return "İade";
    return "Diğer";
}


module.exports = router;
