// Opens ONE Postgres/MySQL connection/pool and hands back { query, close }, for callers that
// make several queries in one go (e.g. a Data Center discovery run touches up to 6 checks plus
// 2 stats functions). Extracted out of server.js so both the Express app and the standalone
// dc-runner/ CLI can share it.
//
// Deliberately takes ALREADY-PLAINTEXT config (host/user/database/password) — decrypting
// browser-stored ciphertext is server.js's concern (its callers decrypt before calling this),
// not this module's. dc-runner's CLI has no encryption model at all and calls this directly
// with whatever a user types at a prompt.
import pg from 'pg';
import mysql from 'mysql2/promise';

const { Pool } = pg;

export async function openDbConnection(config) {
    if (config.type === 'postgres') {
        const pgConfig = {
            user: config.user, host: config.host, database: config.database,
            password: config.password, port: config.port
        };
        if (config.ssl) pgConfig.ssl = { rejectUnauthorized: false };
        const pool = new Pool(pgConfig);
        // pg's Pool is lazy — it wouldn't actually connect until the first query, which would
        // otherwise make a bad connection surface as 5 separate "unavailable" findings (one per
        // check) instead of one clear error. Test it now, matching mysql2's eager createConnection
        // below, so both engines fail the same way: one clear error, not five redundant ones.
        try { await pool.query('SELECT 1'); } catch (e) { await pool.end(); throw e; }
        return {
            query: async (sql, params = []) => {
                let paramIndex = 0;
                const pgSql = sql.replace(/\?/g, () => `$${++paramIndex}`);
                const res = await pool.query(pgSql, params);
                return res.rows;
            },
            close: async () => { await pool.end(); }
        };
    } else if (config.type === 'mysql') {
        const conn = await mysql.createConnection({
            host: config.host, user: config.user, database: config.database,
            password: config.password, port: config.port
        });
        return {
            query: async (sql, params = []) => { const [rows] = await conn.execute(sql, params); return rows; },
            close: async () => { await conn.end(); }
        };
    }
    throw new Error('Unsupported DB Type');
}
