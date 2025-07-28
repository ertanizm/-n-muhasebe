const mysql = require('mysql2/promise');

const host = 'localhost';
const masterDbUser = 'root';
const masterDbPass = '1234';
const masterDbName = 'master_db';

function getMasterDbConfig() {
    return {
        host,
        user: masterDbUser,
        password: masterDbPass,
        database: masterDbName
    };
}

function getTenantDbConfig(dbName) {
    return {
        host,
        user: masterDbUser,
        password: masterDbPass,
        database: dbName
    };
}

module.exports = {
    getMasterDbConfig,
    getTenantDbConfig,
    host,
    masterDbUser,
    masterDbPass,
    masterDbName
};
