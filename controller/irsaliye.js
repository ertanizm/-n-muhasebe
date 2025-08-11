const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');
const { getTenantDbConfig } = require('./db');

// Sayfa render fonksiyonları
const gelenIrsaliyeler = async (req, res) => {
    res.render('irsaliyeler&faturalar/gelenIrsaliyeler', { 
        user: req.session.user,
        irsaliyeler: []
    });
};

const gidenIrsaliyeler = async (req, res) => {
    res.render('irsaliyeler&faturalar/gidenIrsaliyeler', { 
        user: req.session.user,
        irsaliyeler: []
    });
};

// API Endpoints
const getIrsaliyeler = async (req, res) => {
    if (!req.session || !req.session.user || !req.session.user.dbName) {
        return res.status(401).json({ error: 'Oturum bulunamadı' });
    }

    try {
        const dbConfig = getTenantDbConfig(req.session.user.dbName);
        const conn = await mysql.createConnection(dbConfig);

        const [irsaliyeler] = await conn.query(`
            SELECT 
                i.id,
                i.fis_no as no,
                i.tarih,
                c.unvan as cari,
                i.geneltoplam as tutar,
                CASE 
                    WHEN i.durum = 0 THEN 'Beklemede'
                    WHEN i.durum = 1 THEN 'Onaylandı'
                    WHEN i.durum = 2 THEN 'İptal Edildi'
                    ELSE 'Bilinmiyor'
                END as durum,
                i.aciklama
            FROM irsaliyeler i
            LEFT JOIN cariler c ON i.carikayitno = c.id
            WHERE i.tipi = 0  -- Gelen irsaliyeler için
            ORDER BY i.tarih DESC
        `);

        await conn.end();

        // Tarihleri formatla
        irsaliyeler.forEach(irsaliye => {
            irsaliye.tarih = new Date(irsaliye.tarih).toLocaleDateString('tr-TR');
            irsaliye.tutar = parseFloat(irsaliye.tutar).toFixed(2);
        });

        res.json(irsaliyeler);
    } catch (error) {
        console.error('İrsaliyeler listelenirken hata:', error);
        res.status(500).json({ error: 'İrsaliyeler listelenirken bir hata oluştu' });
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
        const [stoklar] = await conn.query('SELECT id, stok_kodu, stok_adi, birim, fiyat1 FROM stoklar WHERE aktif = 1');
        await conn.end();
        res.json(stoklar);
    } catch (error) {
        console.error('Stoklar listelenirken hata:', error);
        res.status(500).json({ error: 'Stoklar listelenirken bir hata oluştu' });
    }
};

// Router tanımlamaları
router.get('/irsaliyeler', getIrsaliyeler);
router.get('/cariler', getCariler);
router.get('/depolar', getDepolar);
router.get('/stoklar', getStoklar);

module.exports = {
    router,
    gelenIrsaliyeler,
    gidenIrsaliyeler,
    getCariler,
    getDepolar,
    getStoklar
};