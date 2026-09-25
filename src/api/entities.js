import { supabase } from '@/api/supabaseClient';

// Thin table helpers so pages can say entities.Item.update(id, patch).
// Every call returns data or throws an Error with a readable message.

async function run(query) {
  const { data, error } = await query;
  if (error) throw Object.assign(new Error(error.message), error);
  return data;
}

// sort is a column name, prefixed with "-" for descending (e.g. "-created_date").
function select(table, match, sort, limit) {
  let q = supabase.from(table).select('*');
  if (match) q = q.match(match);
  if (sort) {
    const desc = sort.startsWith('-');
    q = q.order(desc ? sort.slice(1) : sort, { ascending: !desc });
  }
  if (limit) q = q.limit(limit);
  return run(q);
}

function table(name) {
  return {
    list: (sort, limit) => select(name, null, sort, limit),
    filter: (match, sort, limit) => select(name, match, sort, limit),
    create: (row) => run(supabase.from(name).insert(row).select().single()),
    bulkCreate: (rows) => run(supabase.from(name).insert(rows).select()),
    update: (id, patch) => run(supabase.from(name).update(patch).eq('id', id).select().single()),
    delete: (id) => run(supabase.from(name).delete().eq('id', id)),
  };
}

export const entities = {
  Item: table('items'),
  Person: table('people'),
  Project: table('projects'),
};
