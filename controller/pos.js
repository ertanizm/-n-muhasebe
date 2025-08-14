const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');
const { getTenantDbConfig } = require('./db');

// Basit session kontrolü
function requireAuth(req, res, next) {
  if (!req.session || !req.session.user || !req.session.user.dbName) {
    return res.status(401).json({ success: false, message: 'Oturum bulunamadı' });
  }
  next();
}

async function ensureQuickButtonsTable(conn) {
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS pos_quick_buttons (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      button_index INT NOT NULL,
      stokkayitno INT NULL,
      UNIQUE KEY uniq_user_button (user_id, button_index),
      FOREIGN KEY (stokkayitno) REFERENCES stoklar(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
}

// Kullanıcının atamalarını getir
router.get('/quick-buttons', requireAuth, async (req, res) => {
  try {
    const dbConfig = getTenantDbConfig(req.session.user.dbName);
    const conn = await mysql.createConnection(dbConfig);
    await ensureQuickButtonsTable(conn);
    const userId = req.session.user.id;

    const [rows] = await conn.execute(
      `SELECT q.button_index as buttonIndex, q.stokkayitno as stokId,
              s.stok_kodu as stokKodu, s.stok_adi as stokAdi, s.birim, s.fiyat1, s.fiyat2
         FROM pos_quick_buttons q
    LEFT JOIN stoklar s ON s.id = q.stokkayitno
        WHERE q.user_id = ?
        ORDER BY q.button_index ASC`,
      [userId]
    );

    await conn.end();
    res.json({ success: true, data: rows });
  } catch (e) {
    console.error('quick-buttons GET error:', e);
    res.status(500).json({ success: false, message: 'Hızlı tuşlar alınamadı' });
  }
});

// Vergi kartları
router.get('/tax-codes', requireAuth, async (req, res) => {
  try {
    const dbConfig = getTenantDbConfig(req.session.user.dbName);
    const conn = await mysql.createConnection(dbConfig);
    const [rows] = await conn.execute(
      `SELECT id, vergikodu, birincivergiorani, ikincivergiorani, ucuncuvergiorani, dorduncuvergiorani
         FROM vergikarti`
    );
    await conn.end();
    // Varsayılan oran olarak birincivergiorani kullanacağız
    const data = rows.map(r => ({
      id: r.id,
      vergikodu: r.vergikodu,
      oran: Number(r.birincivergiorani || 0)
    }));
    res.json({ success: true, data });
  } catch (e) {
    console.error('tax-codes GET error:', e);
    res.status(500).json({ success: false, message: 'Vergi kartları alınamadı' });
  }
});

// Belirli bir butona stok ata (upsert)
router.put('/quick-buttons/:index', requireAuth, async (req, res) => {
  const index = parseInt(req.params.index, 10);
  const { stokkayitno } = req.body || {};
  if (Number.isNaN(index) || index < 0 || index > 99) {
    return res.status(400).json({ success: false, message: 'Geçersiz buton index' });
  }
  if (!stokkayitno) {
    return res.status(400).json({ success: false, message: 'stokkayitno gerekli' });
  }

  try {
    const dbConfig = getTenantDbConfig(req.session.user.dbName);
    const conn = await mysql.createConnection(dbConfig);
    await ensureQuickButtonsTable(conn);
    const userId = req.session.user.id;

    await conn.execute(
      `INSERT INTO pos_quick_buttons (user_id, button_index, stokkayitno)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE stokkayitno = VALUES(stokkayitno)`,
      [userId, index, stokkayitno]
    );

    // Seçilen stok detayını döndür
    const [[stok]] = await conn.execute(
      'SELECT id, stok_kodu as stokKodu, stok_adi as stokAdi, birim, fiyat1 FROM stoklar WHERE id = ?',
      [stokkayitno]
    );
    await conn.end();
    res.json({ success: true, data: { index, ...stok } });
  } catch (e) {
    console.error('quick-buttons PUT error:', e);
    res.status(500).json({ success: false, message: 'Hızlı tuş kaydedilemedi' });
  }
});

// Atamayı temizle
router.delete('/quick-buttons/:index', requireAuth, async (req, res) => {
  const index = parseInt(req.params.index, 10);
  if (Number.isNaN(index) || index < 0 || index > 99) {
    return res.status(400).json({ success: false, message: 'Geçersiz buton index' });
  }
  try {
    const dbConfig = getTenantDbConfig(req.session.user.dbName);
    const conn = await mysql.createConnection(dbConfig);
    await ensureQuickButtonsTable(conn);
    const userId = req.session.user.id;
    await conn.execute('DELETE FROM pos_quick_buttons WHERE user_id = ? AND button_index = ?', [userId, index]);
    await conn.end();
    res.json({ success: true });
  } catch (e) {
    console.error('quick-buttons DELETE error:', e);
    res.status(500).json({ success: false, message: 'Hızlı tuş silinemedi' });
  }
});

module.exports = router;
// Barkod ile stok bul
router.get('/stock/by-barcode', requireAuth, async (req, res) => {
  const code = (req.query.code || '').trim();
  if (!code) return res.status(400).json({ success: false, message: 'Barkod gerekli' });
  try {
    const dbConfig = getTenantDbConfig(req.session.user.dbName);
    const conn = await mysql.createConnection(dbConfig);
    const [[stok]] = await conn.execute(
      `SELECT id, stok_kodu, stok_adi, birim, fiyat1, fiyat2
         FROM stoklar
        WHERE aktif = 1 AND aktifbarkod = ?
        LIMIT 1`,
      [code]
    );
    await conn.end();
    if (!stok) return res.status(404).json({ success: false, message: 'Barkod bulunamadı' });
    res.json({ success: true, data: stok });
  } catch (e) {
    console.error('stock/by-barcode GET error:', e);
    res.status(500).json({ success: false, message: 'Stok bulunamadı' });
  }
});

// Stok ID ile detay
router.get('/stock/by-id', requireAuth, async (req, res) => {
  const id = parseInt(req.query.id, 10);
  if (!id) return res.status(400).json({ success: false, message: 'id gerekli' });
  try {
    const dbConfig = getTenantDbConfig(req.session.user.dbName);
    const conn = await mysql.createConnection(dbConfig);
    const [[stok]] = await conn.execute(
      `SELECT id, stok_kodu, stok_adi, birim, fiyat1, fiyat2
         FROM stoklar
        WHERE aktif = 1 AND id = ?
        LIMIT 1`,
      [id]
    );
    await conn.end();
    if (!stok) return res.status(404).json({ success: false, message: 'Stok bulunamadı' });
    res.json({ success: true, data: stok });
  } catch (e) {
    console.error('stock/by-id GET error:', e);
    res.status(500).json({ success: false, message: 'Stok bulunamadı' });
  }
});


