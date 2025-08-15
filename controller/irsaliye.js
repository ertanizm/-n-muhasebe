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
        const [stoklar] = await conn.query('SELECT id, stok_kodu, stok_adi, birim, fiyat1, fiyat2, fiyat3, miktar, aktifbarkod FROM stoklar WHERE aktif = 1');
        await conn.end();
        res.json(stoklar);
    } catch (error) {
        console.error('Stoklar listelenirken hata:', error);
        res.status(500).json({ error: 'Stoklar listelenirken bir hata oluştu' });
    }
};

// İrsaliye oluştur (POS)
const createIrsaliye = async (req, res) => {
	if (!req.session || !req.session.user || !req.session.user.dbName) {
		return res.status(401).json({ success: false, message: 'Oturum bulunamadı' });
	}
	let conn;
	try {
		const { 
			carikayitno, 
			depokayitno, 
				aratoplam, 
				kdvtoplam, 
				geneltoplam, 
			urunler,
			odeme_tipi,
			beklet
		} = req.body || {};

		if (!Array.isArray(urunler) || urunler.length === 0) {
			return res.status(400).json({ success: false, message: 'Ürün listesi boş' });
		}

		const dbName = req.session.user.dbName;
		conn = await mysql.createConnection(getTenantDbConfig(dbName));
		await conn.beginTransaction();

		// // beklet kolonu var mı? yoksa ekle
		// const [colBekletRows] = await conn.execute(
		// 	`SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'irsaliyeler' AND COLUMN_NAME = 'beklet'`,
		// 	[dbName]
		// );
		// if (Number(colBekletRows[0].cnt) === 0) {
		// 	await conn.execute(`ALTER TABLE irsaliyeler ADD COLUMN beklet TINYINT(1) NOT NULL DEFAULT 0`);
		// }

		const fisNo = 'IRSL-' + new Date().getFullYear() + '-' + String(Date.now()).slice(-6);
		const isBeklet = Number(beklet) === 1;
		const durumDegeri = isBeklet ? 0 : 1;

		// Başlık kaydı (beklet kolonu ile)
		const [result] = await conn.execute(
			`INSERT INTO irsaliyeler (
				fis_no, tarih, carikayitno, depokayitno, fis_tipi, aratoplam, kdvtoplam, geneltoplam, nakittoplam, bankatoplam, durum, tipi, beklet
			) VALUES (?, CURDATE(), ?, ?, 1, ?, ?, ?, 0, 0, ?, 1, ?)`,
			[fisNo, carikayitno, depokayitno || 1, aratoplam || 0, kdvtoplam || 0, geneltoplam || 0, durumDegeri, isBeklet ? 1 : 0]
		);
		const irsaliyeId = result.insertId;

		// detaya satirtipi kolonu var mı?
		const [colRows] = await conn.execute(
			`SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'irsaliyefatura_detaylar' AND COLUMN_NAME = 'satirtipi'`,
			[dbName]
		);
		const hasSatirTipi = Number(colRows[0].cnt) > 0;
		const satirTipiValue = odeme_tipi === 'kart' ? 1 : 0;

		// Ürün detayları + stok düşümü
		for (const urun of urunler) {
			const params = [
					irsaliyeId,
				urun.urun_adi || '',
				Number(urun.miktar || 0),
					urun.birim || 'Adet',
				Number(urun.iskontorani || 0),
				Number(urun.iskontotutar || 0),
				Number(urun.kdvorani || 0),
				Number(urun.tutar || 0),
					urun.stokkayitno || null
			];
			if (hasSatirTipi) {
				await conn.execute(
					`INSERT INTO irsaliyefatura_detaylar (
						irsaliye_id, urun_adi, miktar, birim, iskontorani, iskontotutar, kdvorani, tutar, stokkayitno, satirtipi
					) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
					[...params, satirTipiValue]
				);
			} else {
				await conn.execute(
					`INSERT INTO irsaliyefatura_detaylar (
						irsaliye_id, urun_adi, miktar, birim, iskontorani, iskontotutar, kdvorani, tutar, stokkayitno
					) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
					params
				);
			}

			// İlgili stoktan miktar düş
			if (urun.stokkayitno && Number(urun.miktar || 0) > 0) {
				await conn.execute(
					'UPDATE stoklar SET miktar = miktar - ? WHERE id = ?',
					[Number(urun.miktar || 0), urun.stokkayitno]
				);
			}
		}

		// Beklet değilse ödeme dağılımı
		if (!isBeklet) {
			let nakitTop = 0, bankaTop = 0;
			if (Array.isArray(req.body.odemeler) && req.body.odemeler.length > 0) {
				for (const od of req.body.odemeler) {
					const tutar = Number(od.tutar||0);
					if (od.tip === 'kart') bankaTop += tutar;
					else if (od.tip === 'nakit') nakitTop += tutar;
					else if (od.tip === 'veresiye') { /* şimdilik veri tutulmuyor */ }
				}
			} else {
				if (odeme_tipi === 'kart') bankaTop = Number(geneltoplam||0);
				else nakitTop = Number(geneltoplam||0);
			}
			await conn.execute(`UPDATE irsaliyeler SET nakittoplam = ?, bankatoplam = ? WHERE id = ?`, [nakitTop, bankaTop, irsaliyeId]);
		}

		await conn.commit();
		await conn.end();
		res.status(201).json({ success: true, fisNo: fisNo, irsaliyeId });
	} catch (error) {
		console.error('İrsaliye oluşturma hatası:', error);
		if (conn) {
			try { await conn.rollback(); } catch (e) {}
			try { await conn.end(); } catch (e) {}
		}
		res.status(500).json({ success: false, message: 'İrsaliye oluşturulamadı' });
	}
};
// Router tanımlamaları
router.get('/irsaliyeler', getIrsaliyeler);
router.get('/cariler', getCariler);
router.get('/depolar', getDepolar);
router.get('/stoklar', getStoklar);
router.post('/irsaliye', createIrsaliye);

// Liste: tarih aralığına göre irsaliye başlıkları
router.get('/irsaliye/list', async (req, res) => {
    if (!req.session || !req.session.user || !req.session.user.dbName) {
        return res.status(401).json({ success: false, message: 'Oturum bulunamadı' });
    }
    try {
        const { start, end } = req.query;
        const conn = await mysql.createConnection(getTenantDbConfig(req.session.user.dbName));
        const [rows] = await conn.execute(
            `SELECT i.id, i.fis_no, i.tarih, i.geneltoplam, c.unvan as cari
               FROM irsaliyeler i
               LEFT JOIN cariler c ON c.id = i.carikayitno
              WHERE DATE(i.tarih) BETWEEN COALESCE(?, DATE(i.tarih)) AND COALESCE(?, DATE(i.tarih))
              ORDER BY i.tarih DESC, i.id DESC`,
            [start || null, end || null]
        );
        await conn.end();
        res.json({ success: true, data: rows });
    } catch (e) {
        console.error('irsaliye/list error:', e);
        res.status(500).json({ success: false });
    }
});

// Detay: bir irsaliyenin satırları
router.get('/irsaliye/detaylar', async (req, res) => {
    if (!req.session || !req.session.user || !req.session.user.dbName) {
        return res.status(401).json({ success: false, message: 'Oturum bulunamadı' });
    }
    try {
        const { id } = req.query;
        const conn = await mysql.createConnection(getTenantDbConfig(req.session.user.dbName));
        const [rows] = await conn.execute(
            `SELECT d.id, d.urun_adi, d.miktar, d.birim, d.kdvorani, d.tutar, d.satirtipi,
                    d.iskontorani, d.iskontotutar, d.stokkayitno
               FROM irsaliyefatura_detaylar d
              WHERE d.irsaliye_id = ?
              ORDER BY d.id ASC`,
            [id]
        );
        await conn.end();
        res.json({ success: true, data: rows });
    } catch (e) {
        console.error('irsaliye/detaylar error:', e);
        res.status(500).json({ success: false });
    }
});

// Başlık + detay sil
router.delete('/irsaliye/:id', async (req, res) => {
    if (!req.session || !req.session.user || !req.session.user.dbName) {
        return res.status(401).json({ success: false, message: 'Oturum bulunamadı' });
    }
    try {
        const { id } = req.params;
        const conn = await mysql.createConnection(getTenantDbConfig(req.session.user.dbName));
        await conn.execute('DELETE FROM irsaliyeler WHERE id = ?', [id]);
        await conn.end();
        res.json({ success: true });
    } catch (e) {
        console.error('irsaliye delete error:', e);
        res.status(500).json({ success: false });
    }
});

// Gün sonu satır listesi: tarih ve ödeme tipine göre detaylı kayıtlar
router.get('/gunsonu-lines', async (req, res) => {
    if (!req.session || !req.session.user || !req.session.user.dbName) {
        return res.status(401).json({ success: false, message: 'Oturum bulunamadı' });
    }
    try {
        const { start, end, type } = req.query; // type: genel|kart|nakit|veresiye
        const conn = await mysql.createConnection(getTenantDbConfig(req.session.user.dbName));
        let where = 'WHERE DATE(i.tarih) BETWEEN COALESCE(?, DATE(i.tarih)) AND COALESCE(?, DATE(i.tarih))';
        const params = [start || null, end || null];
        if (type === 'kart') { where += ' AND d.satirtipi = 1'; }
        else if (type === 'nakit') { where += ' AND d.satirtipi = 0'; }
        else if (type === 'veresiye') { where += ' AND (d.satirtipi IS NULL OR d.satirtipi NOT IN (0,1))'; }
        const [rows] = await conn.execute(
            `SELECT i.id as irsaliye_id, i.fis_no, i.tarih, c.unvan as cari,
                    d.id as detay_id, d.urun_adi, d.miktar, d.birim, d.kdvorani, d.tutar, d.satirtipi,
                    d.iskontorani, d.iskontotutar,
                    i.nakittoplam, i.bankatoplam
               FROM irsaliyeler i
               JOIN irsaliyefatura_detaylar d ON d.irsaliye_id = i.id
          LEFT JOIN cariler c ON c.id = i.carikayitno
             ${where}
           ORDER BY i.tarih DESC, i.id DESC, d.id ASC`, params
        );
        await conn.end();
        res.json({ success: true, data: rows });
    } catch (e) {
        console.error('gunsonu-lines error:', e);
        res.status(500).json({ success: false });
    }
});

// Bekleme listesi: beklet=1 olan başlıklar
router.get('/irsaliye/hold-list', async (req, res) => {
	if (!req.session || !req.session.user || !req.session.user.dbName) {
		return res.status(401).json({ success: false, message: 'Oturum bulunamadı' });
	}
	try {
		const conn = await mysql.createConnection(getTenantDbConfig(req.session.user.dbName));
		// Kolon var mı güvenceye al
		const [colBeklet] = await conn.execute(
			`SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'irsaliyeler' AND COLUMN_NAME = 'beklet'`,
			[req.session.user.dbName]
		);
		if (Number(colBeklet[0].cnt) === 0) {
			await conn.execute(`ALTER TABLE irsaliyeler ADD COLUMN beklet TINYINT(1) NOT NULL DEFAULT 0`);
		}
		const [rows] = await conn.execute(
			`SELECT i.id, i.fis_no, i.tarih, i.geneltoplam, c.unvan as cari, i.carikayitno
			   FROM irsaliyeler i
			   LEFT JOIN cariler c ON c.id = i.carikayitno
			  WHERE i.beklet = 1
			  ORDER BY i.tarih DESC, i.id DESC`
		);
		await conn.end();
		res.json({ success: true, data: rows });
	} catch (e) {
		console.error('hold-list error:', e);
		res.status(500).json({ success: false });
	}
});

module.exports = {
    router,
    gelenIrsaliyeler,
    gidenIrsaliyeler,
    getCariler,
    getDepolar,
    getStoklar
};