import { supabase } from '@/api/supabaseClient';
import { DB_PAGE_SIZE } from '@/lib/paging';

// Thin table helpers so pages can say entities.Item.update(id, patch).
// Every call returns data or throws an Error with a readable message.

async function run(query) {
  const { data, error } = await query;
  if (error) throw Object.assign(new Error(error.message), error);
  return data;
}

// Tables whose primary key is id. family_members is keyed by email.
const ID_TIEBREAK = new Set([
  'items', 'people', 'projects', 'attachments',
  'boards', 'board_columns', 'board_swimlanes',
]);

// Never ask PostgREST for more than the default Max rows cap in one call.
function clampPageSize(limit) {
  const n = Math.floor(Number(limit));
  if (!Number.isFinite(n) || n <= 0) return DB_PAGE_SIZE;
  return Math.min(DB_PAGE_SIZE, n);
}

function orderBy(q, table, sort) {
  if (sort) {
    const desc = sort.startsWith('-');
    q = q.order(desc ? sort.slice(1) : sort, { ascending: !desc });
  }
  // Stable tie-break so page 2 cannot reshuffle rows that tied on the sort column.
  if (ID_TIEBREAK.has(table)) q = q.order('id', { ascending: true });
  return q;
}

// sort is a column name, prefixed with "-" for descending (e.g. "-created_date").
// options.offset + limit use inclusive PostgREST range for pagination.
function select(table, match, sort, limit, { includeDeleted = false, offset = 0 } = {}) {
  let q = supabase.from(table).select('*');
  if (match) q = q.match(match);
  // Soft-deleted items stay out of normal lists unless explicitly requested.
  if (table === 'items' && !includeDeleted) {
    q = q.is('deleted_at', null);
  }
  q = orderBy(q, table, sort);
  if (limit) {
    const size = clampPageSize(limit);
    const from = Math.max(0, Number(offset) || 0);
    q = q.range(from, from + size - 1);
  }
  return run(q);
}

function table(name) {
  return {
    list: (sort, limit, options) => select(name, null, sort, limit, options),
    filter: (match, sort, limit, options) => select(name, match, sort, limit, options),
    create: (row) => run(supabase.from(name).insert(row).select().single()),
    bulkCreate: (rows) => run(supabase.from(name).insert(rows).select()),
    update: (id, patch) => run(supabase.from(name).update(patch).eq('id', id).select().single()),
    delete: (id) => {
      // Items use soft-delete so trash/restore works; other tables hard-delete.
      if (name === 'items') {
        return run(
          supabase
            .from(name)
            .update({ deleted_at: new Date().toISOString() })
            .eq('id', id)
            .select()
            .single()
        );
      }
      return run(supabase.from(name).delete().eq('id', id));
    },
  };
}

const itemTable = table('items');

export const entities = {
  Item: {
    ...itemTable,
    /** Soft-deleted rows only (trash). Pass offset to walk pages of at most DB_PAGE_SIZE. */
    listDeleted: (sort = '-deleted_at', limit = DB_PAGE_SIZE, { offset = 0 } = {}) => {
      let q = supabase.from('items').select('*').not('deleted_at', 'is', null);
      q = orderBy(q, 'items', sort);
      if (limit) {
        const size = clampPageSize(limit);
        const from = Math.max(0, Number(offset) || 0);
        q = q.range(from, from + size - 1);
      }
      return run(q);
    },
    restore: (id) =>
      run(supabase.from('items').update({ deleted_at: null }).eq('id', id).select().single()),
    /** Permanent delete (after confirm in trash). */
    purge: (id) => run(supabase.from('items').delete().eq('id', id)),
  },
  Person: table('people'),
  Project: table('projects'),
  Attachment: table('attachments'),
  Board: table('boards'),
  BoardColumn: table('board_columns'),
  BoardSwimlane: table('board_swimlanes'),
  /** Allowlist emails in family_members (PK is email, not id). */
  FamilyMember: {
    list: (sort = 'email', limit = 200) => select('family_members', null, sort, limit),
    create: (row) =>
      run(supabase.from('family_members').insert(row).select().single()),
    deleteByEmail: (email) =>
      run(
        supabase
          .from('family_members')
          .delete()
          .eq('email', email)
          .select()
      ),
  },
};
