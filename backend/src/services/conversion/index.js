import { postgresToSqlServer } from './pairs/postgresToSqlServer.js';

export const SUPPORTED_DATABASES = ['postgresql', 'sqlserver'];
const ACTIVE_CONVERSION_PAIR = 'postgresql:sqlserver';
const ACTIVE_CONVERSION_MESSAGE =
  'Only PostgreSQL to SQL Server is available right now. Other conversions are coming soon.';

const DATABASE_ALIASES = {
  postgres: 'postgresql',
  postgresql: 'postgresql',
  mysql: 'mysql',
  mssql: 'sqlserver',
  'sql server': 'sqlserver',
  sqlserver: 'sqlserver'
};

const CONVERTERS = {
  [ACTIVE_CONVERSION_PAIR]: postgresToSqlServer
};

function createValidationError(message) {
  return Object.assign(new Error(message), { status: 400 });
}

function normalizeDatabaseName(name) {
  if (typeof name !== 'string') {
    return null;
  }

  return DATABASE_ALIASES[name.trim().toLowerCase()] ?? null;
}

function formatSqlServerDatabaseName(name) {
  return `[${name.replace(/]/g, ']]')}]`;
}

function prependSqlServerDatabaseContext(query, targetDatabaseName) {
  if (typeof targetDatabaseName !== 'string') {
    return query;
  }

  const trimmedDatabaseName = targetDatabaseName.trim();

  if (!trimmedDatabaseName || /^\s*USE\s+/i.test(query)) {
    return query;
  }

  return `USE ${formatSqlServerDatabaseName(trimmedDatabaseName)};\nGO\n\n${query}`;
}

export function convertQuery({ query, fromDb, toDb, targetDatabaseName }) {
  if (typeof query !== 'string' || !query.trim()) {
    throw createValidationError('`query` is required.');
  }

  const normalizedFromDb = normalizeDatabaseName(fromDb);
  const normalizedToDb = normalizeDatabaseName(toDb);

  if (!normalizedFromDb || !normalizedToDb) {
    throw createValidationError(ACTIVE_CONVERSION_MESSAGE);
  }

  const requestedPair = `${normalizedFromDb}:${normalizedToDb}`;

  if (requestedPair !== ACTIVE_CONVERSION_PAIR) {
    throw createValidationError(ACTIVE_CONVERSION_MESSAGE);
  }

  const converter = CONVERTERS[requestedPair];

  if (!converter) {
    throw createValidationError(ACTIVE_CONVERSION_MESSAGE);
  }

  const convertedQuery = converter(query);

  if (normalizedToDb === 'sqlserver') {
    return prependSqlServerDatabaseContext(convertedQuery, targetDatabaseName);
  }

  return convertedQuery;
}
