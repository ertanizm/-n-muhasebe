const express = require('express');
const mysql = require('mysql2/promise');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const csrf = require('csurf');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const app = express();
const path = require('path');
const rootRouter = require('../root');
const cariRouter = require('./cariOperations'); // Import cari router
const stokRouter = require('./stokOperation'); // Stok router ekle
const depoRouter = require('./depoOperation'); // depo router ekle


const finansRouter = require('./finans');
const { getMasterDbConfig, getTenantDbConfig, host, masterDbUser, masterDbPass, masterDbName } = require('./db');

// View engine setup - düzeltilmiş yollar
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views')); // Doğru views klasör yolu

// Static dosyalar için düzeltilmiş yollar
app.use('/css', express.static(path.join(__dirname, '../public/css')));
app.use('/js', express.static(path.join(__dirname, '../public/js')));
app.use(express.static(path.join(__dirname, '../public')));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Cookie parser'ı en başta ekle
app.use(cookieParser());

// Session middleware
app.use(session({
    secret: 'mutabik-session-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000
    }
}));

// CSRF'i kaldır, router'da kullanılacak
// app.use(csrfProtection);

// Add cari routes before the root router
app.use('/cari', cariRouter);
app.use('/stok', stokRouter);
app.use('/stok', depoRouter);
app.use('/hesaplarim', finansRouter);
app.use('/', rootRouter);



// Rate limiter için
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 dakika
    max: 5, // IP başına maksimum 5 deneme
    message: 'Çok fazla giriş denemesi yaptınız. Lütfen 15 dakika sonra tekrar deneyin.'
});

// JWT secret key
const JWT_SECRET = 'your-secret-key'; // Production'da environment variable kullanın

// Auth middleware
const authMiddleware = async (req, res, next) => {
    const token = req.session.token;
    if (!token) {
        return res.redirect('/login');
    }
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        res.redirect('/login');
    }
};

// Utility to create master_db and tables if not exist
async function ensureMasterDb() {
    const conn = await mysql.createConnection({ host, user: masterDbUser, password: masterDbPass });
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${masterDbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci`);
    await conn.query(`USE \`${masterDbName}\``);

    await conn.query(`
        CREATE TABLE IF NOT EXISTS companies (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            db_name VARCHAR(100) NOT NULL UNIQUE,
            start_date DATE,
            status ENUM('Aktif', 'Pasif') DEFAULT 'Aktif'
        )
    `);

    await conn.query(`
        CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            email VARCHAR(255) NOT NULL UNIQUE,
            password_hash VARCHAR(255) NOT NULL,
            company_id INT NOT NULL,
            role ENUM('Admin', 'Kullanici') DEFAULT 'Kullanici',
            failed_attempts INT DEFAULT 0,
            last_failed_attempt DATETIME DEFAULT NULL,
            FOREIGN KEY (company_id) REFERENCES companies(id)
                ON DELETE CASCADE
                ON UPDATE CASCADE
        )
    `);
    await conn.end();
}

// Endpoint to create company
app.post('/create-company', async (req, res) => {
    await ensureMasterDb();

    const firmaAdi = req.body.firma_adi || '';
    const email = req.body.email || '';
    const password = req.body.password || '';

    if (!firmaAdi || !email || !password) {
        return res.status(400).send('❗ Lütfen tüm alanları doldurun.');
    }

    const dbName = firmaAdi.toLowerCase().replace(/[^a-zA-Z0-9]/g, '_') + '_db';

    let masterConn;
    try {
        masterConn = await mysql.createConnection(getMasterDbConfig());

        // Check for duplicate db_name
        const [rows] = await masterConn.execute(
            'SELECT COUNT(*) as count FROM companies WHERE db_name = ?',
            [dbName]
        );
        if (rows[0].count > 0) {
            return res.status(400).send('❗ Bu firma adına ait veritabanı zaten mevcut. Lütfen farklı bir isim deneyin.');
        }

        // Create tenant database
        await masterConn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci`);

        // Transaction for company/user creation
        await masterConn.beginTransaction();

        const [companyResult] = await masterConn.execute(
            `INSERT INTO companies (name, db_name, start_date, status) VALUES (?, ?, CURDATE(), 'Aktif')`,
            [firmaAdi, dbName]
        );
        const companyId = companyResult.insertId;

        const passwordHash = crypto.createHash('sha256').update(password).digest('hex');

        await masterConn.execute(
            `INSERT INTO users (email, password_hash, company_id, role) VALUES (?, ?, ?, 'Admin')`,
            [email, passwordHash, companyId]
        );

        await masterConn.commit();

        // Connect to tenant DB and create tables
        const tenantConn = await mysql.createConnection({
            host,
            user: masterDbUser,
            password: masterDbPass,
            database: dbName
        });
 await tenantConn.query(`
    CREATE TABLE IF NOT EXISTS stokgrupkarti (
    id INT AUTO_INCREMENT PRIMARY KEY,
    grup_kodu VARCHAR(255) NULL,
    grup_adi VARCHAR(255) NULL,
    kayittarihi DATETIME DEFAULT CURRENT_TIMESTAMP,
    guncelleme_tarihi DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    guncelleyenkullanicikayitno INT,
    kaydedenkullanicikayitno INT
);`)
await tenantConn.query(`
    CREATE TABLE IF NOT EXISTS depokarti (
    id INT AUTO_INCREMENT PRIMARY KEY,
    depo_kodu VARCHAR(255) NULL,
    depo_adi VARCHAR(255) NULL,
    kayittarihi DATETIME DEFAULT CURRENT_TIMESTAMP,
    guncelleme_tarihi DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    guncelleyenkullanicikayitno INT,
    kaydedenkullanicikayitno INT
);`)

await tenantConn.query(`
    CREATE TABLE IF NOT EXISTS vergikarti (
    id INT AUTO_INCREMENT PRIMARY KEY,
    vergikodu VARCHAR(255) NULL,
    birincivergiorani INT,
    ikincivergiorani INT NULL,
    ucuncuvergiorani INT NULL,
    dorduncuvergiorani INT NULL,
    kayittarihi DATETIME DEFAULT CURRENT_TIMESTAMP,
    guncelleme_tarihi DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    guncelleyenkullanicikayitno INT,
    kaydedenkullanicikayitno INT
);`)

await tenantConn.query(`
    CREATE TABLE IF NOT EXISTS stoklar (
        id INT AUTO_INCREMENT PRIMARY KEY,
        stok_kodu VARCHAR(50) NULL,
        stok_adi VARCHAR(255) NULL,
        birim VARCHAR(10) NULL,
        aktifbarkod varchar(50),
        guncelleyenkullanicikayitno INT,
        kaydedenkullanicikayitno INT,
        fiyat1 DECIMAL(10,2),
        fiyat2 DECIMAL (10,2),
        fiyat3 DECIMAL (10,2),
        stoktipi TINYINT(1) DEFAULT 0,
        aktif TINYINT(1) DEFAULT 1,
        miktar DECIMAL(10,2) DEFAULT 0,
        kayittarihi DATETIME DEFAULT CURRENT_TIMESTAMP,
        guncelleme_tarihi DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        grupkayitno INT NULL,
        vergikayitno INT NULL,
        depokayitno INT NULL,
        FOREIGN KEY (vergikayitno) REFERENCES vergikarti(id),
        FOREIGN KEY (grupkayitno) REFERENCES stokgrupkarti(id),
        FOREIGN KEY (depokayitno) REFERENCES depokarti(id)
    )
`);

       
        await tenantConn.query(`
            CREATE TABLE IF NOT EXISTS cariler (
                id INT AUTO_INCREMENT PRIMARY KEY,
                carikodu VARCHAR(50),
                unvan VARCHAR(255),
                aktif TINYINT(1) DEFAULT 1,
                il VARCHAR(50) NULL,
                ilce VARCHAR(50) NULL,
                adres VARCHAR(255) NULL,
                resmi INT NULL,
                vadeopsiyonu VARCHAR(50) NULL,
                bakiye DECIMAL(15,2) DEFAULT 0 NULL,
                alacak DECIMAL(15,2) DEFAULT 0 NULL,
                borc DECIMAL(15,2) DEFAULT 0 NULL,
                kayittarihi DATETIME DEFAULT CURRENT_TIMESTAMP,
                guncelleme_tarihi DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                guncelleyenkullanicikayitno INT,
                kaydedenkullanicikayitno INT,
                efatura TINYINT(1) DEFAULT 0 NULL,
                efaturasenaryo VARCHAR(50) NULL,
                efaturalicietiketi VARCHAR(100) NULL,
                vergi_dairesi VARCHAR(100) NULL,
                vergi_no VARCHAR(50) NULL,
                telefon VARCHAR(20) NULL,
                email VARCHAR(100) NULL,
                type TINYINT(1) DEFAULT 0
            )
        `);
        await tenantConn.query(`
            CREATE TABLE IF NOT EXISTS hesapkarti (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tanimi VARCHAR(255),
        parabirimi VARCHAR(255) NULL,
        guncelbakiye DECIMAL (10,2) NULL,
        posbankasi VARCHAR(255) NULL,
        tip INT,
        guncelleyenkullanicikayitno INT,
        kaydedenkullanicikayitno INT,
        kayittarihi DATETIME DEFAULT CURRENT_TIMESTAMP,
        guncelleme_tarihi DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        );`)

         // Hareket türleri tablosu
         await conn.execute(`
            CREATE TABLE IF NOT EXISTS hareket_turleri (
                id INT AUTO_INCREMENT PRIMARY KEY,
                tur_adi VARCHAR(50) NOT NULL,
                tur_kodu VARCHAR(20) UNIQUE,
                aktif TINYINT(1) DEFAULT 1,
                kayit_tarihi TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Cari hareketler tablosu
        await conn.execute(`
            CREATE TABLE IF NOT EXISTS cari_hareketler (
                id INT AUTO_INCREMENT PRIMARY KEY,
                cari_id INT NOT NULL,
                hareket_turu_id INT NOT NULL,
                depo_id INT,
                belge_no VARCHAR(100),
                tarih DATE NOT NULL,
                giris_miktar DECIMAL(15,2) DEFAULT 0,
                cikis_miktar DECIMAL(15,2) DEFAULT 0,
                bakiye DECIMAL(15,2) DEFAULT 0,
                birim_fiyat DECIMAL(15,2) DEFAULT 0,
                toplam_tutar DECIMAL(15,2) DEFAULT 0,
                aciklama TEXT,
                kaydeden_kullanici INT,
                kayit_tarihi TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (cari_id) REFERENCES cariler(id) ON DELETE CASCADE,
                FOREIGN KEY (hareket_turu_id) REFERENCES hareket_turleri(id),
                FOREIGN KEY (depo_id) REFERENCES depokarti(id)
            )
        `);

        // Varsayılan hareket türlerini ekle
        await conn.execute(`
            INSERT IGNORE INTO hareket_turleri (tur_adi, tur_kodu) VALUES 
            ('Alış', 'ALIS'),
            ('Satış', 'SATIS'),
            ('Aktarma', 'AKTARMA'),
            ('Sayım', 'SAYIM')
        `);
        
        await tenantConn.query(`
            CREATE TABLE IF NOT EXISTS dovizkarti (
                id INT AUTO_INCREMENT PRIMARY KEY,
                doviz_turu VARCHAR(10) NOT NULL,
                doviz_kodu VARCHAR(10) NOT NULL,
                doviz_adi VARCHAR(50) NOT NULL,
                doviz_kuru DECIMAL(10,4) NOT NULL,
                guncelleyenkullanicikayitno INT,
                kaydedenkullanicikayitno INT,
                kayittarihi DATETIME DEFAULT CURRENT_TIMESTAMP,
                guncelleme_tarihi DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);
        await tenantConn.query(`
            CREATE TABLE IF NOT EXISTS faturalar (
                id INT AUTO_INCREMENT PRIMARY KEY,
                fis_no VARCHAR(50) NOT NULL,
                faturabelgeno VARCHAR(50) NULL,
                tarih DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
                carikayitno INT NOT NULL,
                stokkayitno INT NOT NULL,
                depokayitno INT NOT NULL,
                fis_tipi INT NOT NULL DEFAULT 0,
                kdv_orani DECIMAL(5,2) NOT NULL,
                tutar DECIMAL(10,2) NOT NULL,
                aratoplam DECIMAL(10,2) NOT NULL,
                kdvtoplam DECIMAL(10,2) NOT NULL,
                geneltoplam DECIMAL(10,2) NOT NULL,
                dovizkayitno INT NULL,
                iskontorani DECIMAL(5,2) NULL,
                iskontotutar DECIMAL(10,2) NULL,
                teslimalan VARCHAR(50)  NULL,
                teslimeden VARCHAR(50)  NULL,
                plaka VARCHAR(50)  NULL,
                earsiv TINYINT(1) DEFAULT 0 NULL,
                durum INT NOT NULL DEFAULT 0,
                tipi INT NOT NULL DEFAULT 0,
                miktar DECIMAL(10,2) NOT NULL,
                birim VARCHAR(10) NOT NULL,
                aciklama TEXT,
                guncelleyenkullanicikayitno INT,
                kaydedenkullanicikayitno INT,
                guncelleme_tarihi DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (carikayitno) REFERENCES cariler(id),
                FOREIGN KEY (stokkayitno) REFERENCES stoklar(id),
                FOREIGN KEY (depokayitno) REFERENCES depokarti(id)
            )
        `);
        await conn.execute(`
            CREATE TABLE IF NOT EXISTS cekler (
                id INT AUTO_INCREMENT PRIMARY KEY,
                cari_id INT NOT NULL,
                kasa_banka_id INT NOT NULL,
                cek_no VARCHAR(100),
                vade DATE,
                tutar DECIMAL(15,2) DEFAULT 0,
                aciklama TEXT,
                islem_tipi int DEFAULT 0,
                durum int DEFAULT 0,
                kaydeden_kullanici INT,
                guncelleyenkullanicikayitno INT,
                kayit_tarihi TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                guncelleme_tarihi DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (cari_id) REFERENCES cariler(id) ON DELETE CASCADE,               
                FOREIGN KEY (kasa_banka_id) REFERENCES hesapkarti(id)
            )
        `);

        await tenantConn.query(`
    CREATE TABLE IF NOT EXISTS irsaliyeler (
        id INT AUTO_INCREMENT PRIMARY KEY,
        fis_no VARCHAR(50) NOT NULL,
        faturabelgono VARCHAR(50) NULL,
        tarih DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        carikayitno INT NOT NULL,
        stokkayitno INT NOT NULL,
        depokayitno INT NOT NULL,
        fis_tipi INT NOT NULL DEFAULT 0,
        kdv_orani DECIMAL(5,2) NOT NULL,
        tutar DECIMAL(10,2) NOT NULL,
        aratoplam DECIMAL(10,2) NOT NULL,
        kdvtoplam DECIMAL(10,2) NOT NULL,
        geneltoplam DECIMAL(10,2) NOT NULL,
        dovizkayitno INT NULL,
        faturakayitno INT NULL,
        iskontorani DECIMAL(5,2) NULL,
        iskontotutar DECIMAL(10,2) NULL,
        teslimalan VARCHAR(50)  NULL,
        teslimeden VARCHAR(50)  NULL,
        plaka VARCHAR(50)  NULL,
        durum INT NOT NULL DEFAULT 0,
        tipi INT NOT NULL DEFAULT 0,
        miktar DECIMAL(10,2) NOT NULL,
        birim VARCHAR(10) NOT NULL,
        aciklama TEXT,
        guncelleyenkullanicikayitno INT,
        kaydedenkullanicikayitno INT,
        guncelleme_tarihi DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (carikayitno) REFERENCES cariler(id),
        FOREIGN KEY (stokkayitno) REFERENCES stoklar(id),
        FOREIGN KEY (depokayitno) REFERENCES depokarti(id),
        FOREIGN KEY (dovizkayitno) REFERENCES dovizkarti(id),
        FOREIGN KEY (faturakayitno) REFERENCES faturalar(id)
    )
`);


       
        await tenantConn.end();
        await masterConn.end();

        // Başarılı olursa login sayfasına yönlendir
        res.redirect('/');
    } catch (err) {
        if (masterConn && masterConn.connection && masterConn.connection.inTransaction) {
            await masterConn.rollback();
        }
        if (masterConn) await masterConn.end();
        res.status(500).send('❌ Hata: ' + err.message);
    }
});

// CSRF middleware düzenlemesi
const csrfMiddleware = csrf({ cookie: true });
app.use((req, res, next) => {
    // Login ve signup için CSRF kontrolü
    if (req.path === '/login' || req.path === '/signup') {
        csrfMiddleware(req, res, next);
    } else {
        next();
    }
});

// Login endpoint güncelleme
app.post('/login', loginLimiter, csrfMiddleware, async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.render('login', { 
            error: 'Lütfen tüm alanları doldurun.',
            csrfToken: req.csrfToken() 
        });
    }

    try {
        const conn = await mysql.createConnection(getMasterDbConfig());

        // Email kontrolü
        const [users] = await conn.execute(`
            SELECT u.*, c.name as company_name, c.db_name 
            FROM users u 
            JOIN companies c ON u.company_id = c.id 
            WHERE u.email = ?`,
            [email]
        );

        if (users.length === 0) {
            await conn.end();
            return res.render('login', { 
                error: 'E-posta bulunamadı!',
                csrfToken: req.csrfToken() 
            });
        }

        const user = users[0];
        const hashedPassword = crypto.createHash('sha256').update(password).digest('hex');

        if (hashedPassword !== user.password_hash) {
            // Başarısız giriş denemesini kaydet
            await conn.execute(
                'UPDATE users SET failed_attempts = failed_attempts + 1, last_failed_attempt = NOW() WHERE id = ?',
                [user.id]
            );

            await conn.end();
            return res.render('login', { 
                error: 'Hatalı şifre!',
                csrfToken: req.csrfToken() 
            });
        }

        // Başarılı giriş - failed_attempts sıfırla
        await conn.execute(
            'UPDATE users SET failed_attempts = 0, last_failed_attempt = NULL WHERE id = ?',
            [user.id]
        );

        // JWT token oluştur
        const token = jwt.sign(
            { 
                userId: user.id,
                email: user.email,
                role: user.role,
                companyId: user.company_id 
            },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        // Session'a bilgileri kaydet
        req.session.token = token;
        req.session.user = {
            id: user.id,
            email: user.email,
            role: user.role,
            companyId: user.company_id,
            companyName: user.company_name,
            dbName: user.db_name
        };

        await conn.end();
        res.redirect('/anasayfa');

    } catch (error) {
        console.error(error);
        res.render('anasayfa', { 
            error: 'Bir hata oluştu!',
            csrfToken: req.csrfToken() 
        });
    }
});

// Korumalı route örneği
app.get('/anasayfa', authMiddleware, (req, res) => {
    res.render('anasayfa', { user: req.session.user });
});

app.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
});

// Export auth middleware and JWT_SECRET for use in other files
module.exports.authMiddleware = authMiddleware;
module.exports.JWT_SECRET = JWT_SECRET;
