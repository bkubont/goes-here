import { supabase } from '@/api/supabaseClient';

// Thin table helpers so pages can say entities.Item.update(id, patch).
// Every call returns data or throws an Error with a readable message.

async function run(query) {
  const { data, error } = await query;
  if (error) throw Object.assign(new Error(error.message), error);
  return data;
}

// sort is a column name, prefixed with "-" for descending (e.g. "-created_date").
function select(table, match, sort, limit, { includeDeleted = false } = {}) {
  let q = supabase.from(table).select('*');
  if (match) q = q.match(match);
  // Soft-deleted items stay out of normal lists unless explicitly requested.
  if (table === 'items' && !includeDeleted) {
    q = q.is('deleted_at', null);
  }
  if (sort) {
    const desc = sort.startsWith('-');
    q = q.order(desc ? sort.slice(1) : sort, { ascending: !desc });
  }
  if (limit) q = q.limit(limit);
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
    /** Soft-deleted rows only (trash). */
    listDeleted: (sort = '-deleted_at', limit = 200) => {
      let q = supabase.from('items').select('*').not('deleted_at', 'is', null);
      if (sort) {
        const desc = sort.startsWith('-');
        q = q.order(desc ? sort.slice(1) : sort, { ascending: !desc });
      }
      if (limit) q = q.limit(limit);
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
