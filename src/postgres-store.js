// The pool owns connections; no request data or reservations live in instance memory.
export function postgresStore(pool, now = Date.now) {
  const row = r => r ? {...r, results: typeof r.results === 'string' ? r.results : JSON.stringify(r.results)} : null;
  return {
    async find(id) { const r = await pool.query('SELECT owner, results, status FROM alerts WHERE id = $1', [id]); return row(r.rows[0]); },
    async get(owner, id) { const r = await pool.query('SELECT results, status FROM alerts WHERE id = $1 AND owner = $2 AND created > $3', [id, owner, now() - 86400000]); return row(r.rows[0]); },
    async reserve({id, owner, created, initial}) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        // Serializes this owner's quota check across ALL concurrent Function instances.
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [owner]);
        const limit = await client.query('SELECT COUNT(*)::int AS total, MAX(created)::bigint AS latest FROM alerts WHERE owner = $1 AND created > $2', [owner, created - 86400000]);
        if (limit.rows[0].total >= 10 || Number(limit.rows[0].latest || 0) > created - 30000) { await client.query('COMMIT'); return false; }
        const result = await client.query("INSERT INTO alerts (id, owner, created, status, results) VALUES ($1, $2, $3, 'processing', $4::jsonb) ON CONFLICT (id) DO NOTHING", [id, owner, created, JSON.stringify(initial)]);
        await client.query('COMMIT');
        return result.rowCount === 1;
      } catch (error) { try { await client.query('ROLLBACK'); } catch {} throw error; }
      finally { client.release(); }
    },
    async update(owner, id, results, status) {
      if (status) await pool.query('UPDATE alerts SET results = $1::jsonb, status = $2 WHERE id = $3 AND owner = $4', [JSON.stringify(results), status, id, owner]);
      else await pool.query("UPDATE alerts SET results = $1::jsonb WHERE id = $2 AND owner = $3 AND status <> 'processing'", [JSON.stringify(results), id, owner]);
    },
    async prune() { await pool.query('DELETE FROM alerts WHERE created < $1', [now() - 86400000]); },
    async health() {
      const result = await pool.query("SELECT has_table_privilege(current_user, 'public.alerts', 'SELECT') AND has_table_privilege(current_user, 'public.alerts', 'INSERT') AND has_table_privilege(current_user, 'public.alerts', 'UPDATE') AND has_table_privilege(current_user, 'public.alerts', 'DELETE') AS ready");
      return result.rows[0]?.ready === true;
    }
  };
}
