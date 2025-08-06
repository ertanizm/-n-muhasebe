// controllers/irsaliye.js

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

exports.createIrsaliye = async (req, res) => {
    try {
        const { tedarikci, cikis_adresi, sevkiyat_adresi, sevkiyat_yontemi, arac_plakasi, duzenleme_tarihi, fiili_sevk_tarihi, urunler } = req.body;
        const irsaliyeTipi = 0; // Alış irsaliyesi

        // Veritabanına kaydetme işlemleri
        const conn = await mysql.createConnection(getTenantDbConfig(req.session.user.dbName));
        await conn.execute(`
            INSERT INTO irsaliyeler (tedarikci, cikis_adresi, sevkiyat_adresi, sevkiyat_yontemi, arac_plakasi, duzenleme_tarihi, fiili_sevk_tarihi, irsaliye_tipi)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [tedarikci, cikis_adresi, sevkiyat_adresi, sevkiyat_yontemi, arac_plakasi, duzenleme_tarihi, fiili_sevk_tarihi, irsaliyeTipi]);

        // Ürünleri kaydetme işlemleri
        for (const urun of urunler) {
            await conn.execute(`
                INSERT INTO irsaliyefatura_detaylar (irsaliye_id, urun_adi, miktar, birim)
                VALUES (LAST_INSERT_ID(), ?, ?, ?)
            `, [urun.adi, urun.miktar, urun.birim]);
        }

        await conn.end();
        res.status(201).send('İrsaliye başarıyla oluşturuldu.');
    } catch (error) {
        console.error(error);
        res.status(500).send('İrsaliye oluşturulurken bir hata oluştu.');
    }
};