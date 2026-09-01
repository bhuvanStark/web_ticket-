import { pool } from './database.js';

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;
const TABLES = new Set([
  'admins', 'customer_preferences', 'customers', 'equipment', 'locations',
  'notifications', 'password_resets', 'rooms', 'service_reports', 'service_requests',
  'service_updates', 'team_members', 'technicians'
]);

const RELATIONS = {
  service_requests: {
    customers: { table: 'customers', local: 'customer_id', foreign: 'id', many: false },
    locations: { table: 'locations', local: 'location_id', foreign: 'id', many: false },
    rooms: { table: 'rooms', local: 'room_id', foreign: 'id', many: false },
    technician: { table: 'technicians', local: 'assigned_technician_id', foreign: 'id', many: false },
    technicians: { table: 'technicians', local: 'assigned_technician_id', foreign: 'id', many: false },
    service_updates: { table: 'service_updates', local: 'id', foreign: 'service_request_id', many: true },
    service_reports: { table: 'service_reports', local: 'id', foreign: 'service_request_id', many: true }
  },
  service_updates: {
    service_requests: { table: 'service_requests', local: 'service_request_id', foreign: 'id', many: false }
  },
  service_reports: {
    service_requests: { table: 'service_requests', local: 'service_request_id', foreign: 'id', many: false }
  },
  customers: {
    locations: { table: 'locations', local: 'id', foreign: 'customer_id', many: true },
    service_requests: { table: 'service_requests', local: 'id', foreign: 'customer_id', many: true }
  },
  locations: { rooms: { table: 'rooms', local: 'id', foreign: 'location_id', many: true } },
  rooms: {
    locations: { table: 'locations', local: 'location_id', foreign: 'id', many: false },
    equipment: { table: 'equipment', local: 'id', foreign: 'room_id', many: true },
    service_requests: { table: 'service_requests', local: 'id', foreign: 'room_id', many: true }
  },
  technicians: {
    service_requests: { table: 'service_requests', local: 'id', foreign: 'assigned_technician_id', many: true }
  }
};

function identifier(value) {
  if (!IDENTIFIER.test(value)) throw new Error(`Invalid SQL identifier: ${value}`);
  return `"${value}"`;
}

function splitTopLevel(value) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === '(') depth += 1;
    if (value[index] === ')') depth -= 1;
    if (value[index] === ',' && depth === 0) {
      parts.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  parts.push(value.slice(start).trim());
  return parts.filter(Boolean);
}

function parseSelection(selection = '*') {
  const fields = [];
  const embeds = [];
  for (const part of splitTopLevel(selection.replace(/\s+/g, ' ').trim())) {
    const open = part.indexOf('(');
    if (open === -1) {
      fields.push(part);
      continue;
    }
    const head = part.slice(0, open).trim();
    const inner = part.slice(open + 1, part.lastIndexOf(')')).trim();
    const [outputName, relationHint] = head.includes(':') ? head.split(':') : [head, head];
    embeds.push({ outputName, relationHint, selection: parseSelection(inner), countOnly: inner === 'count' });
  }
  return { fields, embeds };
}

function selectedColumns(parsed, table) {
  if (!parsed.fields.length || parsed.fields.includes('*')) return '*';
  const fields = [...parsed.fields];
  for (const embed of parsed.embeds) {
    const relation = RELATIONS[table]?.[embed.outputName]
      || RELATIONS[table]?.[embed.relationHint]
      || Object.values(RELATIONS[table] || {}).find((item) => item.local === embed.relationHint);
    if (relation && !fields.includes(relation.local)) fields.push(relation.local);
  }
  return fields.map((field) => identifier(field)).join(', ');
}

function normalizeError(error) {
  return { message: error.message, code: error.code, details: error.detail || null, hint: error.hint || null };
}

async function hydrate(rows, table, parsed, executor) {
  if (!rows.length || !parsed.embeds.length) return rows;
  for (const embed of parsed.embeds) {
    const relation = RELATIONS[table]?.[embed.outputName]
      || RELATIONS[table]?.[embed.relationHint]
      || Object.values(RELATIONS[table] || {}).find((item) => item.local === embed.relationHint);
    if (!relation) throw new Error(`Unsupported relation ${table}.${embed.outputName}`);

    const localValues = [...new Set(rows.map((row) => row[relation.local]).filter((value) => value != null))];
    if (!localValues.length) {
      for (const row of rows) row[embed.outputName] = relation.many ? [] : null;
      continue;
    }

    const result = await executor.query(
      `SELECT ${embed.countOnly ? identifier(relation.foreign) : selectedColumns(embed.selection, relation.table)}${!embed.countOnly && selectedColumns(embed.selection, relation.table) !== '*' && !embed.selection.fields.includes(relation.foreign) ? `, ${identifier(relation.foreign)}` : ''} FROM ${identifier(relation.table)} WHERE ${identifier(relation.foreign)} = ANY($1)`,
      [localValues]
    );
    const relatedRows = embed.countOnly ? result.rows : await hydrate(result.rows, relation.table, embed.selection, executor);
    for (const row of rows) {
      const matches = relatedRows.filter((related) => related[relation.foreign] === row[relation.local]);
      if (embed.countOnly) row[embed.outputName] = [{ count: matches.length }];
      else row[embed.outputName] = relation.many ? matches : (matches[0] || null);
    }
  }
  return rows;
}

export class PostgresQueryBuilder {
  constructor(table, executor = pool) {
    if (!TABLES.has(table)) throw new Error(`Unknown table: ${table}`);
    this.table = table;
    this.executor = executor;
    this.operation = 'select';
    this.selection = parseSelection('*');
    this.filters = [];
    this.orders = [];
    this.returning = false;
    this.countMode = null;
    this.head = false;
    this.singleMode = null;
    this.rowLimit = null;
    this.rowOffset = null;
  }

  select(columns = '*', options = {}) {
    this.selection = parseSelection(columns);
    this.returning = this.operation !== 'select';
    this.countMode = options.count || null;
    this.head = Boolean(options.head);
    return this;
  }

  insert(rows) { this.operation = 'insert'; this.payload = Array.isArray(rows) ? rows : [rows]; return this; }
  update(values) { this.operation = 'update'; this.payload = values; return this; }
  delete() { this.operation = 'delete'; return this; }

  addFilter(column, operator, value) {
    identifier(column);
    this.filters.push({ column, operator, value });
    return this;
  }

  eq(column, value) { return this.addFilter(column, '=', value); }
  neq(column, value) { return this.addFilter(column, '<>', value); }
  like(column, value) { return this.addFilter(column, 'LIKE', value); }
  ilike(column, value) { return this.addFilter(column, 'ILIKE', value); }
  in(column, values) { return this.addFilter(column, 'IN', values); }
  not(column, operator, value) { return this.addFilter(column, operator === 'is' ? 'IS NOT' : `NOT ${operator}`, value); }
  is(column, value) { return this.addFilter(column, 'IS', value); }

  or(expression) {
    const clauses = expression.split(',').map((clause) => {
      const match = clause.match(/^([a-z_][a-z0-9_]*)\.(eq|neq|like|ilike)\.(.*)$/i);
      if (!match) throw new Error(`Unsupported OR filter: ${clause}`);
      return { column: match[1], operator: { eq: '=', neq: '<>', like: 'LIKE', ilike: 'ILIKE' }[match[2].toLowerCase()], value: match[3] };
    });
    this.filters.push({ or: clauses });
    return this;
  }

  order(column, { ascending = true } = {}) { identifier(column); this.orders.push({ column, ascending }); return this; }
  limit(value) { this.rowLimit = Number(value); return this; }
  range(from, to) { this.rowOffset = Number(from); this.rowLimit = Number(to) - Number(from) + 1; return this; }
  single() { this.singleMode = 'single'; return this; }
  maybeSingle() { this.singleMode = 'maybe'; return this; }

  compileFilters(startAt = 1) {
    const params = [];
    const compileOne = ({ column, operator, value }) => {
      if ((operator === 'IS' || operator === 'IS NOT') && value === null) return `${identifier(column)} ${operator} NULL`;
      if (operator === 'IN') {
        if (!Array.isArray(value) || value.length === 0) return 'FALSE';
        params.push(value);
        return `${identifier(column)} = ANY($${startAt + params.length - 1})`;
      }
      params.push(value);
      return `${identifier(column)} ${operator} $${startAt + params.length - 1}`;
    };
    const clauses = this.filters.map((filter) => filter.or ? `(${filter.or.map(compileOne).join(' OR ')})` : compileOne(filter));
    return { sql: clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '', params };
  }

  async execute() {
    try {
      let sql;
      let params = [];
      const table = identifier(this.table);
      if (this.operation === 'insert') {
        if (!this.payload?.length) return { data: [], error: null, count: 0 };
        const columns = Object.keys(this.payload[0]);
        if (this.payload.some((row) => columns.length !== Object.keys(row).length || columns.some((column) => !(column in row)))) {
          throw new Error('All inserted rows must have the same columns');
        }
        const tuples = this.payload.map((row) => `(${columns.map((column) => {
          params.push(row[column]);
          return `$${params.length}`;
        }).join(', ')})`);
        sql = `INSERT INTO ${table} (${columns.map(identifier).join(', ')}) VALUES ${tuples.join(', ')}`;
      } else if (this.operation === 'update') {
        if (!this.filters.length) throw new Error('Refusing an unfiltered update');
        const entries = Object.entries(this.payload || {});
        if (!entries.length) throw new Error('Update payload cannot be empty');
        const set = entries.map(([column, value]) => { params.push(value); return `${identifier(column)} = $${params.length}`; });
        const filters = this.compileFilters(params.length + 1);
        params.push(...filters.params);
        sql = `UPDATE ${table} SET ${set.join(', ')}${filters.sql}`;
      } else if (this.operation === 'delete') {
        if (!this.filters.length) throw new Error('Refusing an unfiltered delete');
        const filters = this.compileFilters(1);
        params = filters.params;
        sql = `DELETE FROM ${table}${filters.sql}`;
      } else {
        const filters = this.compileFilters(1);
        params = filters.params;
        sql = `SELECT ${selectedColumns(this.selection, this.table)} FROM ${table}${filters.sql}`;
        if (this.orders.length) sql += ` ORDER BY ${this.orders.map(({ column, ascending }) => `${identifier(column)} ${ascending ? 'ASC' : 'DESC'}`).join(', ')}`;
        if (this.rowLimit != null) { params.push(this.rowLimit); sql += ` LIMIT $${params.length}`; }
        if (this.rowOffset != null) { params.push(this.rowOffset); sql += ` OFFSET $${params.length}`; }
      }

      if (this.operation !== 'select' && this.returning) sql += ` RETURNING ${selectedColumns(this.selection, this.table)}`;
      let count = null;
      if (this.countMode === 'exact' || (this.operation === 'select' && this.rowOffset != null)) {
        const filters = this.compileFilters(1);
        const countResult = await this.executor.query(`SELECT COUNT(*)::integer AS count FROM ${table}${filters.sql}`, filters.params);
        count = countResult.rows[0].count;
      }

      const result = await this.executor.query(sql, params);
      let rows = (this.operation === 'select' || this.returning) ? result.rows : [];
      if (!this.head && rows.length && this.selection.embeds.length) rows = await hydrate(rows, this.table, this.selection, this.executor);
      if (this.head) return { data: null, error: null, count };
      if (this.singleMode) {
        if (rows.length === 0 && this.singleMode === 'maybe') return { data: null, error: null, count };
        if (rows.length !== 1) return { data: null, error: { code: 'PGRST116', message: `Expected one row, received ${rows.length}` }, count };
        return { data: rows[0], error: null, count };
      }
      return { data: rows, error: null, count };
    } catch (error) {
      return { data: null, error: normalizeError(error), count: null };
    }
  }

  then(resolve, reject) { return this.execute().then(resolve, reject); }
}

export const db = { from(table) { return new PostgresQueryBuilder(table); } };
export default db;
