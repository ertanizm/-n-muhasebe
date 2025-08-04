// controllers/irsaliye.js

exports.gelenIrsaliyeler = (req, res) => {
    const irsaliyeler = [
        { no: 'IRSL-2024-001', tarih: '01.06.2024', cari: 'ABC Tekstil', tutar: '12.500', durum: 'Onaylandı', aciklama: 'Haziran sevkiyatı' },
        { no: 'IRSL-2024-002', tarih: '03.06.2024', cari: 'XYZ Gıda', tutar: '8.200', durum: 'Taslak', aciklama: 'Numune gönderimi' },
        { no: 'IRSL-2024-003', tarih: '05.06.2024', cari: 'DEF Otomotiv', tutar: '15.000', durum: 'İptal', aciklama: 'Yanlış giriş' }
    ];
    res.render('irsaliyeler/irsaliye', { irsaliyeler });
};