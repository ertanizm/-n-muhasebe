// controllers/irsaliye.js
const mysql = require('mysql2/promise');
const { getTenantDbConfig } = require('./db');

exports.gelenIrsaliyeler = (req, res) => {
    const irsaliyeler = [
        { no: 'IRSL-2024-001', tarih: '01.06.2024', cari: 'ABC Tekstil', tutar: '12.500', durum: 'Onaylandı', aciklama: 'Haziran sevkiyatı' },
        { no: 'IRSL-2024-002', tarih: '03.06.2024', cari: 'XYZ Gıda', tutar: '8.200', durum: 'Taslak', aciklama: 'Numune gönderimi' },
        { no: 'IRSL-2024-003', tarih: '05.06.2024', cari: 'DEF Otomotiv', tutar: '15.000', durum: 'İptal', aciklama: 'Yanlış giriş' }
    ];
    res.render('irsaliyeler&faturalar/gelenIrsaliyeler', { irsaliyeler });
};

exports.gidenIrsaliyeler = (req, res) => {
    const irsaliyeler = [
        { no: 'IRSL-2024-001', tarih: '01.06.2024', cari: 'ABC Tekstil', tutar: '12.500', durum: 'Onaylandı', aciklama: 'Haziran sevkiyatı' },
        { no: 'IRSL-2024-002', tarih: '03.06.2024', cari: 'XYZ Gıda', tutar: '8.200', durum: 'Taslak', aciklama: 'Numune gönderimi' },
        { no: 'IRSL-2024-003', tarih: '05.06.2024', cari: 'DEF Otomotiv', tutar: '15.000', durum: 'İptal', aciklama: 'Yanlış giriş' }
    ];
    res.render('irsaliyeler&faturalar/gidenIrsaliyeler', { irsaliyeler });
};

// Aktif cariler listesi
exports.getCariler = async (req, res) => {
    try {
        console.log('API çağrısı alındı - Cariler listesi');
        console.log('Session user:', req.session.user);
        
        if (!req.session.user || !req.session.user.dbName) {
            return res.status(400).json({ error: 'Kullanıcı oturumu bulunamadı' });
        }

        const conn = await mysql.createConnection(getTenantDbConfig(req.session.user.dbName));
        console.log('Veritabanı bağlantısı kuruldu:', req.session.user.dbName);
        
        const [cariler] = await conn.execute(`
            SELECT id, carikodu, unvan 
            FROM cariler 
            WHERE aktif = 1 
            ORDER BY unvan ASC
        `);
        
        console.log('Bulunan cari sayısı:', cariler.length);
        console.log('Cariler:', cariler);
        
        await conn.end();
        res.json(cariler);
    } catch (error) {
        console.error('Cariler alınamadı:', error);
        res.status(500).json({ 
            error: 'Cariler alınamadı', 
            details: error.message,
            stack: error.stack 
        });
    }
};

// Aktif depolar listesi
exports.getDepolar = async (req, res) => {
    try {
        const conn = await mysql.createConnection(getTenantDbConfig(req.session.user.dbName));
        const [depolar] = await conn.execute(`
            SELECT id, depo_kodu, depo_adi 
            FROM depokarti 
            ORDER BY depo_adi ASC
        `);
        await conn.end();
        res.json(depolar);
    } catch (error) {
        console.error('Depolar alınamadı:', error);
        res.status(500).json({ error: 'Depolar alınamadı' });
    }
};

// Aktif stoklar listesi
exports.getStoklar = async (req, res) => {
    try {
        const conn = await mysql.createConnection(getTenantDbConfig(req.session.user.dbName));
        const [stoklar] = await conn.execute(`
            SELECT id, stok_kodu, stok_adi, birim, fiyat1 
            FROM stoklar 
            WHERE aktif = 1 
            ORDER BY stok_adi ASC
        `);
        await conn.end();
        res.json(stoklar);
    } catch (error) {
        console.error('Stoklar alınamadı:', error);
        res.status(500).json({ error: 'Stoklar alınamadı' });
    }
};

exports.createIrsaliye = async (req, res) => {
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
        
        const irsaliyeTipi = 0; // Alış irsaliyesi
        const fisNo = 'IRSL-' + new Date().getFullYear() + '-' + String(Date.now()).slice(-6);

        const conn = await mysql.createConnection(getTenantDbConfig(req.session.user.dbName));
        
        // İrsaliye ana kaydını oluştur
        const [result] = await conn.execute(`
            INSERT INTO irsaliyeler (
                fis_no, 
                faturabelgono, 
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
                kaydedenkullanicikayitno
            ) VALUES (?, ?, CURDATE(), ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
        `, [
            fisNo,
            belgeno || null,
            carikayitno,
            depokayitno,
            irsaliyeTipi,
            aratoplam || 0,
            kdvtoplam || 0,
            geneltoplam || 0,
            cikis_adresi || null,
            sevkiyat_adresi || null,
            arac_plakasi || null,
            irsaliyeTipi,
            `Şoför: ${sofor || 'Belirtilmemiş'}`,
            req.session.user.id
        ]);

        const irsaliyeId = result.insertId;

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
                    irsaliyeId,
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

        await conn.end();
        res.status(201).json({ 
            success: true, 
            message: 'İrsaliye başarıyla oluşturuldu.',
            irsaliyeId: irsaliyeId,
            fisNo: fisNo
        });
    } catch (error) {
        console.error('İrsaliye oluşturma hatası:', error);
        res.status(500).json({ 
            success: false, 
            message: 'İrsaliye oluşturulurken bir hata oluştu: ' + error.message 
        });
    }
};

// Test verisi ekleme endpoint'i
exports.addTestData = async (req, res) => {
    try {
        if (!req.session.user || !req.session.user.dbName) {
            return res.status(400).json({ error: 'Kullanıcı oturumu bulunamadı' });
        }

        const conn = await mysql.createConnection(getTenantDbConfig(req.session.user.dbName));
        
        // Test cariler ekle
        await conn.execute(`
            INSERT IGNORE INTO cariler (id, carikodu, unvan, aktif) VALUES 
            (1, 'CARI001', 'ABC Tekstil Ltd. Şti.', 1),
            (2, 'CARI002', 'XYZ Gıda San. Tic. A.Ş.', 1),
            (3, 'CARI003', 'DEF Otomotiv Ltd.', 1)
        `);
        
        // Test depolar ekle
        await conn.execute(`
            INSERT IGNORE INTO depokarti (id, depo_kodu, depo_adi) VALUES 
            (1, 'DEPO01', 'Ana Depo'),
            (2, 'DEPO02', 'Yedek Depo'),
            (3, 'DEPO03', 'Satış Deposu')
        `);
        
        // Test stoklar ekle
        await conn.execute(`
            INSERT IGNORE INTO stoklar (id, stok_kodu, stok_adi, birim, fiyat1, aktif) VALUES 
            (1, 'STK001', 'Pamuklu T-Shirt', 'Adet', 25.50, 1),
            (2, 'STK002', 'Denim Pantolon', 'Adet', 89.90, 1),
            (3, 'STK003', 'Spor Ayakkabı', 'Adet', 150.00, 1)
        `);
        
        await conn.end();
        res.json({ success: true, message: 'Test verileri başarıyla eklendi' });
    } catch (error) {
        console.error('Test verisi ekleme hatası:', error);
        res.status(500).json({ 
            error: 'Test verisi eklenemedi', 
            details: error.message 
        });
    }
};