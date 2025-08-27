const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');
const { 
    getTenantDbConfig, 
    generateFaturaNumber, 
    generateFisNumber 
} = require('./db');

// Sayfa render fonksiyonları
const gelenFaturalar = async (req, res) => {
    res.render('irsaliyeler&faturalar/gelenFaturalar', { 
        user: req.session.user,
        faturalar: []
    });
};

const gidenFaturalar = async (req, res) => {
    res.render('irsaliyeler&faturalar/gidenFaturalar', { 
        user: req.session.user,
        faturalar: []
    });
};

// API Endpoints
const getFaturalar = async (req, res) => {
    if (!req.session || !req.session.user || !req.session.user.dbName) {
        return res.status(401).json({ error: 'Oturum bulunamadı' });
    }

    try {
        const dbConfig = getTenantDbConfig(req.session.user.dbName);
        const conn = await mysql.createConnection(dbConfig);

        const [faturalar] = await conn.query(`
            SELECT 
                f.id,
                f.fis_no as no,
                f.faturabelgeno as belge_no,
                f.tarih,
                c.unvan as cari,
                f.geneltoplam as tutar,
                CASE 
                    WHEN f.durum = 0 THEN 'Beklemede'
                    WHEN f.durum = 1 THEN 'Onaylandı'
                    WHEN f.durum = 2 THEN 'İptal Edildi'
                    ELSE 'Bilinmiyor'
                END as durum,
                f.aciklama
            FROM faturalar f
            LEFT JOIN cariler c ON f.carikayitno = c.id
            WHERE f.fis_tipi = 0  -- Gelen faturalar için (Alış faturası)
            ORDER BY f.tarih DESC
        `);

        await conn.end();

        // Tarihleri formatla
        faturalar.forEach(fatura => {
            fatura.tarih = new Date(fatura.tarih).toLocaleDateString('tr-TR');
            fatura.tutar = parseFloat(fatura.tutar).toFixed(2);
        });

        res.json(faturalar);
    } catch (error) {
        console.error('Faturalar listelenirken hata:', error);
        res.status(500).json({ error: 'Faturalar listelenirken bir hata oluştu' });
    }
};

// Cariler API
const getCariler = async (req, res) => {
    if (!req.session.user || !req.session.user.dbName) {
        return res.status(401).json({ error: 'Oturum bulunamadı' });
    }

    try {
        const conn = await mysql.createConnection(getTenantDbConfig(req.session.user.dbName));
        const [cariler] = await conn.query('SELECT id, carikodu, unvan FROM cariler WHERE aktif = 1');
        await conn.end();
        res.json(cariler);
    } catch (error) {
        console.error('Cariler listelenirken hata:', error);
        res.status(500).json({ error: 'Cariler listelenirken bir hata oluştu' });
    }
};

// Depolar API
const getDepolar = async (req, res) => {
    if (!req.session.user || !req.session.user.dbName) {
        return res.status(401).json({ error: 'Oturum bulunamadı' });
    }

    try {
        const conn = await mysql.createConnection(getTenantDbConfig(req.session.user.dbName));
        const [depolar] = await conn.query('SELECT id, depo_kodu, depo_adi FROM depokarti');
        await conn.end();
        res.json(depolar);
    } catch (error) {
        console.error('Depolar listelenirken hata:', error);
        res.status(500).json({ error: 'Depolar listelenirken bir hata oluştu' });
    }
};

// Stoklar API
const getStoklar = async (req, res) => {
    if (!req.session.user || !req.session.user.dbName) {
        return res.status(401).json({ error: 'Oturum bulunamadı' });
    }

    try {
        const conn = await mysql.createConnection(getTenantDbConfig(req.session.user.dbName));
        const [stoklar] = await conn.query('SELECT id, stok_kodu, stok_adi, birim, fiyat1, fiyat2, fiyat3, miktar, aktifbarkod FROM stoklar WHERE aktif = 1');
        await conn.end();
        res.json(stoklar);
    } catch (error) {
        console.error('Stoklar listelenirken hata:', error);
        res.status(500).json({ error: 'Stoklar listelenirken bir hata oluştu' });
    }
};

// Gelen Fatura oluştur (Alış Faturası)
const createGelenFatura = async (req, res) => {
    if (!req.session || !req.session.user || !req.session.user.dbName) {
        return res.status(401).json({ success: false, message: 'Oturum bulunamadı' });
    }
    
    let conn;
    try {
        const { 
            carikayitno, 
            depokayitno, 
            belgeno, 
            fiili_sevk_tarihi, 
            cikis_adresi, 
            sevkiyat_adresi, 
            arac_plakasi, 
            sofor,
            urunler,
            aratoplam,
            kdvtoplam,
            geneltoplam
        } = req.body;
        
        const fis_tipi = 0; // Alış faturası (Gelen)
        
        conn = await mysql.createConnection(getTenantDbConfig(req.session.user.dbName));
        await conn.beginTransaction();

        // Seri numaralama sistemini kullan
        const faturaNo = await generateFaturaNumber(conn, fis_tipi);
        const fisNo = await generateFisNumber(conn, fis_tipi);

        // Fatura ana kaydını oluştur
        const [result] = await conn.execute(`
            INSERT INTO faturalar (
                fis_no, 
                faturabelgeno, 
                tarih, 
                carikayitno, 
                depokayitno, 
                fis_tipi, 
                aratoplam, 
                kdvtoplam, 
                geneltoplam, 
                teslimalan, 
                teslimeden, 
                plaka, 
                durum, 
                tipi, 
                aciklama,
                guncelleyenkullanicikayitno
            ) VALUES (?, ?, CURDATE(), ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
        `, [
            fisNo,
            faturaNo, // faturabelgeno alanına fatura numarasını kaydet
            carikayitno,
            depokayitno,
            fis_tipi, // fis_tipi = 0 (Alış faturası)
            aratoplam || 0,
            kdvtoplam || 0,
            geneltoplam || 0,
            cikis_adresi || null,
            sevkiyat_adresi || null,
            arac_plakasi || null,
            fis_tipi, // tipi = 0 (Alış)
            `Şoför: ${sofor || 'Belirtilmemiş'}`,
            req.session.user.id
        ]);

        const faturaId = result.insertId;

        // Ürün detaylarını kaydet (faturalar için aynı detay tablosunu kullanıyoruz)
        if (urunler && urunler.length > 0) {
            for (const urun of urunler) {
                await conn.execute(`
                    INSERT INTO irsaliyefatura_detaylar (
                        irsaliye_id, 
                        urun_adi, 
                        miktar, 
                        birim, 
                        iskontorani, 
                        iskontotutar, 
                        kdvorani, 
                        tutar, 
                        stokkayitno
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    faturaId,
                    urun.urun_adi,
                    urun.miktar || 0,
                    urun.birim || 'Adet',
                    urun.iskontorani || 0,
                    urun.iskontotutar || 0,
                    urun.kdvorani || 0,
                    urun.tutar || 0,
                    urun.stokkayitno || null
                ]);
            }
        }

        await conn.commit();
        await conn.end();
        
        res.status(201).json({ 
            success: true, 
            message: 'Gelen fatura başarıyla oluşturuldu.',
            faturaId: faturaId,
            fisNo: fisNo,
            faturaNo: faturaNo
        });
    } catch (error) {
        console.error('Gelen fatura oluşturma hatası:', error);
        if (conn) {
            try { await conn.rollback(); } catch (e) {}
            try { await conn.end(); } catch (e) {}
        }
        res.status(500).json({ 
            success: false, 
            message: 'Gelen fatura oluşturulurken bir hata oluştu: ' + error.message 
        });
    }
};

// Giden Faturalar API
const getGidenFaturalar = async (req, res) => {
    if (!req.session || !req.session.user || !req.session.user.dbName) {
        return res.status(401).json({ error: 'Oturum bulunamadı' });
    }

    try {
        const dbConfig = getTenantDbConfig(req.session.user.dbName);
        const conn = await mysql.createConnection(dbConfig);

        const [faturalar] = await conn.query(`
            SELECT 
                f.id,
                f.fis_no as no,
                f.faturabelgeno as belge_no,
                f.tarih,
                c.unvan as cari,
                f.geneltoplam as tutar,
                CASE 
                    WHEN f.durum = 0 THEN 'Beklemede'
                    WHEN f.durum = 1 THEN 'Onaylandı'
                    WHEN f.durum = 2 THEN 'İptal Edildi'
                    ELSE 'Bilinmiyor'
                END as durum,
                f.aciklama
            FROM faturalar f
            LEFT JOIN cariler c ON f.carikayitno = c.id
            WHERE f.fis_tipi = 1  -- Giden faturalar için (Satış faturası)
            ORDER BY f.tarih DESC
        `);

        await conn.end();

        // Tarihleri formatla
        faturalar.forEach(fatura => {
            fatura.tarih = new Date(fatura.tarih).toLocaleDateString('tr-TR');
            fatura.tutar = parseFloat(fatura.tutar).toFixed(2);
        });

        res.json(faturalar);
    } catch (error) {
        console.error('Giden faturalar listelenirken hata:', error);
        res.status(500).json({ error: 'Giden faturalar listelenirken bir hata oluştu' });
    }
};

// Giden Fatura oluştur (Satış Faturası)
const createGidenFatura = async (req, res) => {
    if (!req.session || !req.session.user || !req.session.user.dbName) {
        return res.status(401).json({ success: false, message: 'Oturum bulunamadı' });
    }
    
    let conn;
    try {
        const { 
            carikayitno, 
            depokayitno, 
            belgeno, 
            fiili_sevk_tarihi, 
            cikis_adresi, 
            sevkiyat_adresi, 
            arac_plakasi, 
            sofor,
            urunler,
            aratoplam,
            kdvtoplam,
            geneltoplam
        } = req.body;
        
        const fis_tipi = 1; // Satış faturası (Giden)
        
        conn = await mysql.createConnection(getTenantDbConfig(req.session.user.dbName));
        await conn.beginTransaction();

        // Seri numaralama sistemini kullan
        const faturaNo = await generateFaturaNumber(conn, fis_tipi);
        const fisNo = await generateFisNumber(conn, fis_tipi);

        // Fatura ana kaydını oluştur
        const [result] = await conn.execute(`
            INSERT INTO faturalar (
                fis_no, 
                faturabelgeno, 
                tarih, 
                carikayitno, 
                depokayitno, 
                fis_tipi, 
                aratoplam, 
                kdvtoplam, 
                geneltoplam, 
                teslimalan, 
                teslimeden, 
                plaka, 
                durum, 
                tipi, 
                aciklama,
                guncelleyenkullanicikayitno
            ) VALUES (?, ?, CURDATE(), ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
        `, [
            fisNo,
            faturaNo, // faturabelgeno alanına fatura numarasını kaydet
            carikayitno,
            depokayitno,
            fis_tipi, // fis_tipi = 1 (Satış faturası)
            aratoplam || 0,
            kdvtoplam || 0,
            geneltoplam || 0,
            cikis_adresi || null,
            sevkiyat_adresi || null,
            arac_plakasi || null,
            fis_tipi, // tipi = 1 (Satış)
            `Şoför: ${sofor || 'Belirtilmemiş'}`,
            req.session.user.id
        ]);

        const faturaId = result.insertId;

        // Ürün detaylarını kaydet
        if (urunler && urunler.length > 0) {
            for (const urun of urunler) {
                await conn.execute(`
                    INSERT INTO irsaliyefatura_detaylar (
                        irsaliye_id, 
                        urun_adi, 
                        miktar, 
                        birim, 
                        iskontorani, 
                        iskontotutar, 
                        kdvorani, 
                        tutar, 
                        stokkayitno
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    faturaId,
                    urun.urun_adi,
                    urun.miktar || 0,
                    urun.birim || 'Adet',
                    urun.iskontorani || 0,
                    urun.iskontotutar || 0,
                    urun.kdvorani || 0,
                    urun.tutar || 0,
                    urun.stokkayitno || null
                ]);
            }
        }

        await conn.commit();
        await conn.end();
        
        res.status(201).json({ 
            success: true, 
            message: 'Giden fatura başarıyla oluşturuldu.',
            faturaId: faturaId,
            fisNo: fisNo,
            faturaNo: faturaNo
        });
    } catch (error) {
        console.error('Giden fatura oluşturma hatası:', error);
        if (conn) {
            try { await conn.rollback(); } catch (e) {}
            try { await conn.end(); } catch (e) {}
        }
        res.status(500).json({ 
            success: false, 
            message: 'Giden fatura oluşturulurken bir hata oluştu: ' + error.message 
        });
    }
};

// Fatura detay getir (ana bilgi + detaylar)
const getFaturaDetail = async (req, res) => {
    if (!req.session || !req.session.user || !req.session.user.dbName) {
        return res.status(401).json({ success: false, message: 'Oturum bulunamadı' });
    }

    try {
        const { id } = req.params;
        const conn = await mysql.createConnection(getTenantDbConfig(req.session.user.dbName));

        // Fatura ana bilgilerini getir
        const [faturaRows] = await conn.execute(`
            SELECT 
                f.*,
                c.unvan as cari_unvan,
                c.carikodu as cari_kodu,
                c.vergi_no as cari_vkn,
                d.depo_adi,
                d.depo_kodu
            FROM faturalar f
            LEFT JOIN cariler c ON f.carikayitno = c.id
            LEFT JOIN depokarti d ON f.depokayitno = d.id
            WHERE f.id = ?
        `, [id]);

        if (faturaRows.length === 0) {
            await conn.end();
            return res.status(404).json({ success: false, message: 'Fatura bulunamadı' });
        }

        // Fatura detaylarını getir
        const [detayRows] = await conn.execute(`
            SELECT 
                d.*,
                s.stok_adi,
                s.stok_kodu
            FROM irsaliyefatura_detaylar d
            LEFT JOIN stoklar s ON d.stokkayitno = s.id
            WHERE d.irsaliye_id = ?
            ORDER BY d.id ASC
        `, [id]);

        await conn.end();

        res.json({
            success: true,
            fatura: faturaRows[0],
            detaylar: detayRows
        });

    } catch (error) {
        console.error('Fatura detayı getirme hatası:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Fatura detayları alınırken bir hata oluştu: ' + error.message 
        });
    }
};

// Router tanımlamaları
router.get('/faturalar', getFaturalar);
router.get('/giden-faturalar', getGidenFaturalar);
router.get('/fatura-detail/:id', getFaturaDetail);
router.get('/cariler', getCariler);
router.get('/depolar', getDepolar);
router.get('/stoklar', getStoklar);
router.post('/gelen-fatura', createGelenFatura);
router.post('/giden-fatura', createGidenFatura);

module.exports = {
    router,
    gelenFaturalar,
    gidenFaturalar,
    getCariler,
    getDepolar,
    getStoklar,
    getGidenFaturalar,
    getFaturaDetail
}; 