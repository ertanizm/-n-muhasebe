const mysql = require('mysql2/promise');

const host = 'localhost';
const masterDbUser = 'root';
const masterDbPass = 'Oklava.123123';
const masterDbName = 'mutabik_master';

const getMasterDbConfig = () => ({
    host,
    user: masterDbUser,
    password: masterDbPass,
    database: masterDbName
});

const getTenantDbConfig = (dbName) => ({
    host,
    user: masterDbUser,
    password: masterDbPass,
    database: dbName
});

// Thread-safe seri numara oluştur
const getNextSerialNumber = async (conn, belge_tipi, fis_tipi, prefix = '') => {
    const currentYear = new Date().getFullYear();
    
    // Transaction içinde çalışmalı - dışarıdan conn geldiği için begin/commit yapmıyoruz
    // Row-level lock ile thread-safe yapıyoruz
    const [rows] = await conn.execute(
        `SELECT son_numara FROM belge_seri_no 
         WHERE belge_tipi = ? AND fis_tipi = ? AND yil = ? 
         FOR UPDATE`, 
        [belge_tipi, fis_tipi, currentYear]
    );
    
    let sonNumara = 0;
    if (rows.length > 0) {
        sonNumara = rows[0].son_numara;
    } else {
        // İlk kez oluşturuluyor
        await conn.execute(
            `INSERT INTO belge_seri_no (belge_tipi, fis_tipi, yil, son_numara, prefix) 
             VALUES (?, ?, ?, 0, ?)`,
            [belge_tipi, fis_tipi, currentYear, prefix]
        );
    }
    
    const yeniNumara = sonNumara + 1;
    
    // Numarayı güncelle
    await conn.execute(
        `UPDATE belge_seri_no 
         SET son_numara = ? 
         WHERE belge_tipi = ? AND fis_tipi = ? AND yil = ?`,
        [yeniNumara, belge_tipi, fis_tipi, currentYear]
    );
    
    // Formatla ve döndür
    const paddedNumber = yeniNumara.toString().padStart(4, '0');
    
    if (belge_tipi === 'FISNO') {
        // FişNo için sadece numara
        return yeniNumara.toString();
    } else {
        // Belge için tam format: PREFIX-YYYY-0001
        return `${prefix}-${currentYear}-${paddedNumber}`;
    }
};

// İrsaliye numarası oluştur
const generateIrsaliyeNumber = async (conn, fis_tipi) => {
    const prefix = fis_tipi === 0 ? 'GIRSL' : 'SIRSL'; // 0: Gelen, 1: Giden
    return await getNextSerialNumber(conn, 'IRSALIYE', fis_tipi, prefix);
};

// Fatura numarası oluştur  
const generateFaturaNumber = async (conn, fis_tipi) => {
    const prefix = fis_tipi === 0 ? 'GFAT' : 'SFAT'; // 0: Gelen, 1: Giden
    return await getNextSerialNumber(conn, 'FATURA', fis_tipi, prefix);
};

// Fiş numarası oluştur (sadece sayı)
const generateFisNumber = async (conn, fis_tipi) => {
    return await getNextSerialNumber(conn, 'FISNO', fis_tipi, '');
};

// POS numarası oluştur
const generatePosNumber = async (conn) => {
    return await getNextSerialNumber(conn, 'POS', 0, 'POS');
};

module.exports = {
    host,
    masterDbUser,
    masterDbPass,
    masterDbName,
    getMasterDbConfig,
    getTenantDbConfig,
    getNextSerialNumber,
    generateIrsaliyeNumber,
    generateFaturaNumber,
    generateFisNumber,
    generatePosNumber
};
