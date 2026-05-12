function formatConstraintSegment(segment = '') {
  const normalized = segment.replace(/\s+/g, ' ').trim();
  return normalized ? ` ${normalized}` : '';
}

function stripSquareBrackets(value = '') {
  const trimmed = value.trim();
  const match = trimmed.match(/^\[(.+)\]$/);
  return match ? match[1] : trimmed;
}

function normalizeSqlServerSchemaName(schema = '') {
  return schema.toLowerCase() === 'public' ? 'dbo' : schema;
}

function formatSqlServerIdentifier(identifier = '') {
  const cleaned = stripSquareBrackets(identifier).replace(/^"(.+)"$/, '$1');
  return cleaned ? `[${cleaned}]` : identifier;
}

function escapeRegExp(value = '') {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeSqlStringLiteral(value = '') {
  return value.replace(/'/g, "''");
}

function formatSqlServerObjectName(name, includeDefaultSchema = false) {
  const parts = name
    .split('.')
    .map((part) => stripSquareBrackets(part.replace(/^"(.+)"$/, '$1')))
    .filter(Boolean);

  if (parts.length === 1) {
    const formattedObject = formatSqlServerIdentifier(parts[0]);
    return includeDefaultSchema ? `[dbo].${formattedObject}` : formattedObject;
  }

  const schemaName = normalizeSqlServerSchemaName(parts[parts.length - 2]);
  const objectName = parts[parts.length - 1];

  return `${formatSqlServerIdentifier(schemaName)}.${formatSqlServerIdentifier(objectName)}`;
}

function formatSqlServerIndexColumns(columns = '') {
  return columns
    .split(',')
    .map((column) => {
      const trimmed = column.trim();
      const match = trimmed.match(/^((?:\[[^\]]+\])|(?:"[^"]+")|(?:[A-Za-z_][\w$]*))(\s+(?:ASC|DESC))?$/i);

      if (!match) {
        return trimmed.replace(/"([^"]+)"/g, '[$1]');
      }

      return `${formatSqlServerIdentifier(match[1])}${match[2] ?? ''}`;
    })
    .join(', ');
}

function formatSqlServerIdentifierList(identifiers = '') {
  return identifiers
    .split(',')
    .map((identifier) => formatSqlServerIdentifier(identifier.trim()))
    .join(', ');
}

function formatSqlServerTableBody(tableBody = '') {
  return tableBody
    .split('\n')
    .map((line) => {
      let updatedLine = line;

      updatedLine = updatedLine.replace(
        /^(\s*constraint\s+)(\[[^\]]+\]|[A-Za-z_][\w$]*)(\s+.*)$/i,
        (_match, prefix, constraintName, suffix) => {
          return `${prefix}${formatSqlServerIdentifier(constraintName)}${suffix}`;
        }
      );

      updatedLine = updatedLine.replace(
        /^(\s*(?:constraint\s+(?:\[[^\]]+\]|[A-Za-z_][\w$]*)\s+)?(?:primary\s+key|unique)\s*)\(([^)]+)\)(.*)$/i,
        (_match, prefix, columns, suffix) => {
          return `${prefix}(${formatSqlServerIdentifierList(columns)})${suffix}`;
        }
      );

      if (/^\s*constraint\b/i.test(updatedLine)) {
        return updatedLine;
      }

      return updatedLine.replace(
        /^(\s*)(\[[^\]]+\]|[A-Za-z_][\w$]*)(\s+.+)$/,
        (_match, prefix, identifier, suffix) => {
          return `${prefix}${formatSqlServerIdentifier(identifier)}${suffix}`;
        }
      );
    })
    .join('\n');
}

function parseSqlServerColumnTypes(tableBody = '') {
  const columnTypes = new Map();

  for (const line of tableBody.split('\n')) {
    const trimmedLine = line.trim().replace(/,$/, '');

    if (!trimmedLine || /^constraint\b/i.test(trimmedLine)) {
      continue;
    }

    const match = trimmedLine.match(/^((?:\[[^\]]+\])|(?:[A-Za-z_][\w$]*))\s+([A-Za-z]+(?:\([^)]*\))?)/i);

    if (!match) {
      continue;
    }

    columnTypes.set(stripSquareBrackets(match[1]), match[2].toUpperCase().replace(/\s+/g, ''));
  }

  return columnTypes;
}

function getSqlServerResizableIndexType(type = '') {
  const normalizedType = type.toUpperCase().replace(/\s+/g, '');
  const match = normalizedType.match(/^(N?VARCHAR)\((MAX|\d+)\)$/);

  if (!match) {
    return null;
  }

  return {
    keyword: match[1],
    isMax: match[2] === 'MAX',
    bytesPerChar: match[1] === 'NVARCHAR' ? 2 : 1
  };
}

function getSqlServerIndexKeyBytes(type = '') {
  const normalizedType = type.toUpperCase().replace(/\s+/g, '');
  const resizableType = getSqlServerResizableIndexType(normalizedType);

  if (resizableType?.isMax) {
    return null;
  }

  const variableLengthMatch = normalizedType.match(/^(N?VARCHAR|N?CHAR|VARBINARY|BINARY)\((\d+)\)$/);

  if (variableLengthMatch) {
    const [, keyword, rawLength] = variableLengthMatch;
    const length = Number(rawLength);

    if (keyword === 'NVARCHAR' || keyword === 'NCHAR') {
      return length * 2;
    }

    return length;
  }

  const decimalMatch = normalizedType.match(/^(?:DECIMAL|NUMERIC)\((\d+),\d+\)$/);

  if (decimalMatch) {
    const precision = Number(decimalMatch[1]);

    if (precision <= 9) {
      return 5;
    }

    if (precision <= 19) {
      return 9;
    }

    if (precision <= 28) {
      return 13;
    }

    return 17;
  }

  const fixedLengthBytes = {
    BIGINT: 8,
    INT: 4,
    INTEGER: 4,
    SMALLINT: 2,
    TINYINT: 1,
    BIT: 1,
    UNIQUEIDENTIFIER: 16,
    DATE: 3,
    DATETIME: 8,
    DATETIME2: 8,
    DATETIMEOFFSET: 10,
    SMALLDATETIME: 4,
    TIME: 5,
    REAL: 4,
    FLOAT: 8,
    MONEY: 8,
    SMALLMONEY: 4
  };

  return fixedLengthBytes[normalizedType] ?? 0;
}

function collectSqlServerSizedKeyColumns(indexedColumnsByTable, tableName, columns, tableColumns) {
  let fixedBytes = 0;
  const resizableColumns = [];

  for (const column of columns) {
    const type = tableColumns.get(column);

    if (!type) {
      continue;
    }

    const resizableType = getSqlServerResizableIndexType(type);

    if (resizableType?.isMax) {
      resizableColumns.push({
        name: column,
        bytesPerChar: resizableType.bytesPerChar
      });
      continue;
    }

    fixedBytes += getSqlServerIndexKeyBytes(type);
  }

  if (resizableColumns.length === 0) {
    return;
  }

  const remainingBytes = Math.max(1, 900 - fixedBytes);
  const totalBytesPerCharacter = resizableColumns.reduce(
    (sum, column) => sum + column.bytesPerChar,
    0
  );
  const safeCharacterLength = Math.max(1, Math.floor(remainingBytes / totalBytesPerCharacter));
  const existingColumns = indexedColumnsByTable.get(tableName) ?? new Map();

  for (const column of resizableColumns) {
    const existingLength = existingColumns.get(column.name);

    existingColumns.set(
      column.name,
      existingLength ? Math.min(existingLength, safeCharacterLength) : safeCharacterLength
    );
  }

  indexedColumnsByTable.set(tableName, existingColumns);
}

function isSqlWordBoundaryCharacter(character = '') {
  return !/[A-Za-z0-9_$]/.test(character);
}

function matchesSqlKeyword(query, index, keyword) {
  const segment = query.slice(index, index + keyword.length);

  if (segment.length !== keyword.length || segment.toLowerCase() !== keyword) {
    return false;
  }

  const beforeCharacter = query[index - 1] ?? '';
  const afterCharacter = query[index + keyword.length] ?? '';

  return (
    isSqlWordBoundaryCharacter(beforeCharacter) &&
    isSqlWordBoundaryCharacter(afterCharacter)
  );
}

function skipSqlWhitespace(query, startIndex = 0) {
  let index = startIndex;

  while (/\s/.test(query[index] ?? '')) {
    index += 1;
  }

  return index;
}

function findSqlKeywordOutsideGroups(query, startIndex, keyword) {
  let depth = 0;
  let isInString = false;

  for (let index = startIndex; index < query.length; index += 1) {
    const character = query[index];

    if (isInString) {
      if (character === "'" && query[index + 1] === "'") {
        index += 1;
        continue;
      }

      if (character === "'") {
        isInString = false;
      }

      continue;
    }

    if (character === "'") {
      isInString = true;
      continue;
    }

    if (character === '(') {
      depth += 1;
      continue;
    }

    if (character === ')') {
      depth = Math.max(0, depth - 1);
      continue;
    }

    if (character === ';' && depth === 0) {
      return -1;
    }

    if (depth === 0 && matchesSqlKeyword(query, index, keyword)) {
      return index;
    }
  }

  return -1;
}

function findSqlParenthesizedValueEnd(query, startIndex) {
  let depth = 0;
  let isInString = false;

  for (let index = startIndex; index < query.length; index += 1) {
    const character = query[index];

    if (isInString) {
      if (character === "'" && query[index + 1] === "'") {
        index += 1;
        continue;
      }

      if (character === "'") {
        isInString = false;
      }

      continue;
    }

    if (character === "'") {
      isInString = true;
      continue;
    }

    if (character === '(') {
      depth += 1;
      continue;
    }

    if (character === ')') {
      depth -= 1;

      if (depth === 0) {
        return index + 1;
      }
    }
  }

  return -1;
}

function parseSqlServerInsertValuesStatement(query, startIndex) {
  if (!matchesSqlKeyword(query, startIndex, 'insert')) {
    return null;
  }

  let cursor = skipSqlWhitespace(query, startIndex + 'insert'.length);

  if (!matchesSqlKeyword(query, cursor, 'into')) {
    return null;
  }

  cursor = skipSqlWhitespace(query, cursor + 'into'.length);

  const valuesIndex = findSqlKeywordOutsideGroups(query, cursor, 'values');

  if (valuesIndex === -1) {
    return null;
  }

  const rowStart = skipSqlWhitespace(query, valuesIndex + 'values'.length);

  if (query[rowStart] !== '(') {
    return null;
  }

  const rows = [];
  let index = rowStart;

  while (index < query.length) {
    index = skipSqlWhitespace(query, index);

    if (query[index] !== '(') {
      return null;
    }

    const rowEnd = findSqlParenthesizedValueEnd(query, index);

    if (rowEnd === -1) {
      return null;
    }

    rows.push(query.slice(index, rowEnd).trim());
    index = skipSqlWhitespace(query, rowEnd);

    if (query[index] === ',') {
      index += 1;
      continue;
    }

    break;
  }

  const statementEnd = skipSqlWhitespace(query, index);
  const hasSemicolon = query[statementEnd] === ';';

  return {
    endIndex: hasSemicolon ? statementEnd + 1 : statementEnd,
    prefix: query.slice(startIndex, rowStart),
    rows
  };
}

function formatSqlServerInsertValuesStatement(prefix, rows) {
  const normalizedPrefix = prefix.endsWith('\n') ? prefix : `${prefix}\n`;

  return `${normalizedPrefix}${rows.join(',\n')};`;
}

function splitTopLevelSqlStatements(query = '') {
  const statements = [];
  let startIndex = 0;
  let depth = 0;
  let isInString = false;

  for (let index = 0; index < query.length; index += 1) {
    const character = query[index];

    if (isInString) {
      if (character === "'" && query[index + 1] === "'") {
        index += 1;
        continue;
      }

      if (character === "'") {
        isInString = false;
      }

      continue;
    }

    if (character === "'") {
      isInString = true;
      continue;
    }

    if (character === '(') {
      depth += 1;
      continue;
    }

    if (character === ')') {
      depth = Math.max(0, depth - 1);
      continue;
    }

    if (character === ';' && depth === 0) {
      const statement = query.slice(startIndex, index + 1).trim();

      if (statement) {
        statements.push(statement);
      }

      startIndex = index + 1;
    }
  }

  const trailingStatement = query.slice(startIndex).trim();

  if (trailingStatement) {
    statements.push(trailingStatement);
  }

  return statements;
}

function collectSqlServerInsertTargetTables(statements = []) {
  const tablePattern = /^\s*INSERT\s+INTO\s+((?:\[[^\]]+\]|[A-Za-z_][\w$]*)(?:\.(?:\[[^\]]+\]|[A-Za-z_][\w$]*))?)/i;
  const tables = [];
  const seenTables = new Set();

  for (const statement of statements) {
    const match = statement.match(tablePattern);

    if (!match) {
      continue;
    }

    const formattedTableName = formatSqlServerObjectName(match[1], true);
    const normalizedTableName = formattedTableName.toLowerCase();

    if (seenTables.has(normalizedTableName)) {
      continue;
    }

    seenTables.add(normalizedTableName);
    tables.push(formattedTableName);
  }

  return tables;
}

export function applyTransformers(query, ...transformers) {
  // Keep pair-specific converters as a small ordered list of transforms.
  return transformers.reduce((currentQuery, transformer) => transformer(currentQuery), query).trim();
}

export function convertLimitToTop(query) {
  // This MVP only rewrites trailing LIMIT clauses on SELECT statements.
  const limitMatch = query.match(/\bLIMIT\s+(\d+)\s*;?\s*$/i);

  if (!limitMatch) {
    return query;
  }

  const limit = limitMatch[1];
  const withoutLimit = query.replace(/\s+LIMIT\s+\d+\s*;?\s*$/i, '');

  if (/^\s*SELECT\s+DISTINCT\s+/i.test(withoutLimit)) {
    return withoutLimit.replace(
      /^\s*SELECT\s+DISTINCT\s+/i,
      `SELECT DISTINCT TOP ${limit} `
    );
  }

  return withoutLimit.replace(/^\s*SELECT\s+/i, `SELECT TOP ${limit} `);
}

export function removePostgresTypeCasts(query) {
  return query.replace(/::\s*(?:[A-Za-z_][\w$]*\.)?[A-Za-z_][\w$]*(?:\[\])?/g, '');
}

export function convertPostgresEnumTypesToSqlServer(query) {
  return query.replace(
    /^(\s*(?:\[[^\]]+\]|"?[A-Za-z_][\w$]*"?)\s+)(?:[A-Za-z_][\w$]*\.)+[A-Za-z_][\w$]*(?=\s+(?:null|not null|default|constraint|primary key|references|check|unique|,))/gim,
    (_match, prefix) => `${prefix}NVARCHAR(255)`
  );
}

export function convertPostgresDataTypesToSqlServer(query) {
  return query
    .replace(/\btimestamp\s+with\s+time\s+zone\b/gi, 'DATETIMEOFFSET')
    .replace(/\btimestamp\s+without\s+time\s+zone\b/gi, 'DATETIME2')
    .replace(/\btimestamp\b/gi, 'DATETIME2')
    .replace(/\btext\[\]/gi, 'NVARCHAR(MAX)')
    .replace(/\buuid\b/gi, 'UNIQUEIDENTIFIER')
    .replace(/\binteger\b/gi, 'INT')
    .replace(/\btext\b/gi, 'NVARCHAR(MAX)');
}

export function convertPostgresUuidDefaultsToSqlServer(query) {
  return query.replace(/\b(?:gen_random_uuid|uuid_generate_v4)\s*\(\s*\)/gi, 'NEWID()');
}

function serializePostgresArrayDefault(arrayContents = '') {
  const serializedValues = [];
  const tokenPattern = /'((?:''|[^'])*)'|(-?\d+(?:\.\d+)?)|\b(TRUE|FALSE|NULL)\b/gi;

  for (const match of arrayContents.matchAll(tokenPattern)) {
    if (match[1] !== undefined) {
      serializedValues.push(JSON.stringify(match[1].replace(/''/g, "'")));
      continue;
    }

    if (match[2] !== undefined) {
      serializedValues.push(match[2]);
      continue;
    }

    if (match[3] !== undefined) {
      const keyword = match[3].toLowerCase();
      serializedValues.push(keyword === 'null' ? 'null' : keyword);
    }
  }

  const serializedJson = `[${serializedValues.join(',')}]`;

  return `DEFAULT N'${escapeSqlStringLiteral(serializedJson)}'`;
}

export function convertPostgresArrayDefaultsToSqlServer(query) {
  return query
    .replace(/\bDEFAULT\s*'\{\}'/gi, "DEFAULT N'[]'")
    .replace(
      /\bDEFAULT\s+ARRAY\s*\[([\s\S]*?)\](?=\s*(?:,|\)|$))/gi,
      (_match, arrayContents) => serializePostgresArrayDefault(arrayContents)
    )
    .replace(
      /\bARRAY\s*\[([\s\S]*?)\](?=\s*(?:,|\)|$))/gi,
      (_match, arrayContents) => {
        const serializedJson = serializePostgresArrayDefault(arrayContents).replace(/^DEFAULT\s+/i, '');

        return serializedJson;
      }
    );
}

export function convertPublicSchemaQualifierToSqlServer(query) {
  return query
    .replace(/\[public\]\.\[([^\]]+)\]/gi, (_match, name) => `[dbo].[${name}]`)
    .replace(/\bpublic\.\[([^\]]+)\]/gi, (_match, name) => `[dbo].[${name}]`)
    .replace(/\bpublic\.([A-Za-z_][\w$]*)\b/gi, (_match, name) => `[dbo].[${name}]`);
}

export function convertReferencesToSqlServer(query) {
  return query.replace(
    /\bREFERENCES\s+((?:\[[^\]]+\]|[A-Za-z_][\w$]*)(?:\.(?:\[[^\]]+\]|[A-Za-z_][\w$]*))?)/gi,
    (_match, tableName) => `REFERENCES ${formatSqlServerObjectName(tableName, true)}`
  );
}

export function convertInlineForeignKeysToSqlServer(query) {
  return query.replace(
    /create\s+table\s+([^\s(]+)\s*\(([\s\S]*?)\)\s*;/gi,
    (_match, tableName, tableBody) => {
      const formattedTableName = formatSqlServerObjectName(tableName, true);
      const foreignKeys = [];
      const cleanedBody = tableBody
        .replace(
          /^\s*constraint\s+([A-Za-z_][\w$]*)\s+foreign\s+key\s*\(([^)]+)\)\s+references\s+((?:\[[^\]]+\]|[A-Za-z_][\w$]*)(?:\.(?:\[[^\]]+\]|[A-Za-z_][\w$]*))?)\s*\(([^)]+)\)([^,\n]*)\s*,?\s*$/gim,
          (_constraintMatch, constraintName, sourceColumns, referencedTable, referencedColumns, options = '') => {
            const formattedConstraintName = formatSqlServerIdentifier(constraintName);
            const formattedSourceColumns = formatSqlServerIdentifierList(sourceColumns);
            const formattedReferencedTable = formatSqlServerObjectName(referencedTable, true);
            const formattedReferencedColumns = formatSqlServerIdentifierList(referencedColumns);
            const normalizedOptions = options.replace(/\s+/g, ' ').trim();
            const suffix = normalizedOptions ? ` ${normalizedOptions.toUpperCase()}` : '';
            const escapedConstraintName = escapeSqlStringLiteral(stripSquareBrackets(constraintName));

            foreignKeys.push(
              `IF OBJECT_ID(N'${formattedTableName}', N'U') IS NOT NULL\n  AND OBJECT_ID(N'${formattedReferencedTable}', N'U') IS NOT NULL\n  AND NOT EXISTS (\n    SELECT 1 FROM sys.foreign_keys\n    WHERE name = '${escapedConstraintName}'\n      AND parent_object_id = OBJECT_ID(N'${formattedTableName}')\n  )\nBEGIN\n  ALTER TABLE ${formattedTableName}\n  ADD CONSTRAINT ${formattedConstraintName}\n  FOREIGN KEY (${formattedSourceColumns}) REFERENCES ${formattedReferencedTable} (${formattedReferencedColumns})${suffix};\nEND;`
            );

            return '';
          }
        )
        .replace(/\n{3,}/g, '\n\n')
        .trimEnd()
        .replace(/,\s*$/, '');

      if (foreignKeys.length === 0) {
        return _match;
      }

      return `create table ${formattedTableName} (\n${cleanedBody}\n);\n\n${foreignKeys.join('\n\n')}`;
    }
  );
}

export function convertPostgresIndexesToSqlServer(query) {
  return query.replace(
    /create\s+(unique\s+)?index\s+if\s+not\s+exists\s+([A-Za-z_][\w$]*)\s+on\s+((?:\[[^\]]+\]|[A-Za-z_][\w$]*)(?:\.(?:\[[^\]]+\]|[A-Za-z_][\w$]*))?)\s+(?:using\s+\w+\s+)?\(([^;]+?)\)\s*(?:tablespace\s+[A-Za-z_][\w$]*)?\s*;/gi,
    (_match, uniqueKeyword = '', indexName, tableName, columns) => {
      const formattedTableName = formatSqlServerObjectName(tableName, true);
      const formattedIndexName = formatSqlServerIdentifier(indexName);
      const formattedColumns = formatSqlServerIndexColumns(columns);
      const uniqueClause = uniqueKeyword ? 'UNIQUE ' : '';

      return `IF NOT EXISTS (\n  SELECT 1 FROM sys.indexes\n  WHERE name = '${indexName}'\n    AND object_id = OBJECT_ID(N'${formattedTableName}')\n)\nBEGIN\n  CREATE ${uniqueClause}INDEX ${formattedIndexName} ON ${formattedTableName} (${formattedColumns});\nEND;`;
    }
  );
}

export function convertIndexedMaxTextColumnsToSqlServer(query) {
  const indexedColumnsByTable = new Map();
  const tableColumnsByTable = new Map();
  const indexPattern = /CREATE\s+(?:UNIQUE\s+)?INDEX\s+\[[^\]]+\]\s+ON\s+((?:\[[^\]]+\]\.)?\[[^\]]+\])\s*\(([^)]+)\);/gi;
  const tablePattern = /create\s+table\s+([^\s(]+)\s*\(([\s\S]*?)\)\s*;/gi;

  for (const match of query.matchAll(tablePattern)) {
    const tableName = formatSqlServerObjectName(match[1], true).toLowerCase();
    const tableBody = match[2];
    const tableColumns = parseSqlServerColumnTypes(tableBody);

    tableColumnsByTable.set(tableName, tableColumns);

    for (const keyMatch of tableBody.matchAll(
      /^(?:\s*constraint\s+[A-Za-z_][\w$]*\s+)?(?:primary\s+key|unique)\s*\(([^)]+)\)\s*,?\s*$/gim
    )) {
      const columns = keyMatch[1]
        .split(',')
        .map((column) => column.trim().replace(/\s+(?:ASC|DESC)$/i, ''))
        .map((column) => stripSquareBrackets(column))
        .filter(Boolean);

      collectSqlServerSizedKeyColumns(indexedColumnsByTable, tableName, columns, tableColumns);
    }
  }

  for (const match of query.matchAll(indexPattern)) {
    const tableName = formatSqlServerObjectName(match[1], true).toLowerCase();
    const tableColumns = tableColumnsByTable.get(tableName);

    if (!tableColumns) {
      continue;
    }

    const columns = match[2]
      .split(',')
      .map((column) => column.trim().replace(/\s+(?:ASC|DESC)$/i, ''))
      .map((column) => stripSquareBrackets(column))
      .filter(Boolean);

    collectSqlServerSizedKeyColumns(indexedColumnsByTable, tableName, columns, tableColumns);
  }

  if (indexedColumnsByTable.size === 0) {
    return query;
  }

  let updatedQuery = query;

  for (const [tableName, indexedColumns] of indexedColumnsByTable) {
    const specificTablePattern = new RegExp(
      `(create\\s+table\\s+${escapeRegExp(tableName)}\\s*\\()([\\s\\S]*?)(\\)\\s*;)`,
      'i'
    );

    updatedQuery = updatedQuery.replace(specificTablePattern, (_match, tableStart, tableBody, tableEnd) => {
      let updatedBody = tableBody;

      for (const [column, safeCharacterLength] of indexedColumns) {
        const columnPattern = new RegExp(
          `(^\\s*\\[?${escapeRegExp(column)}\\]?\\s+)(N?VARCHAR)\\(MAX\\)(?=\\s|,|$)`,
          'gim'
        );

        updatedBody = updatedBody.replace(columnPattern, `$1$2(${safeCharacterLength})`);
      }

      return `${tableStart}${updatedBody}${tableEnd}`;
    });
  }

  return updatedQuery;
}

export function convertSqlServerCreateTablesToIfNotExists(query) {
  return query.replace(
    /create\s+table\s+([^\s(]+)\s*\(([\s\S]*?)\)\s*;/gi,
    (_match, tableName, tableBody) => {
      const formattedTableName = formatSqlServerObjectName(tableName, true);
      const normalizedBody = formatSqlServerTableBody(
        tableBody.replace(/^\n+/, '').replace(/\n+$/, '')
      );
      const indentedBody = normalizedBody
        .split('\n')
        .map((line) => `    ${line}`)
        .join('\n');

      return `IF OBJECT_ID(N'${formattedTableName}', N'U') IS NULL\nBEGIN\n  CREATE TABLE ${formattedTableName} (\n${indentedBody}\n  );\nEND;`;
    }
  );
}

export function convertLargeInsertStatementsToSqlServer(query) {
  const insertPattern = /\bINSERT\b/gi;
  const maxRowsPerStatement = 1000;
  let cursor = 0;
  let updatedQuery = '';
  let hasChanges = false;
  let match = insertPattern.exec(query);

  while (match) {
    const startIndex = match.index;

    if (startIndex >= cursor) {
      const parsedStatement = parseSqlServerInsertValuesStatement(query, startIndex);

      if (parsedStatement?.rows.length > maxRowsPerStatement) {
        const statementBatches = [];

        for (let index = 0; index < parsedStatement.rows.length; index += maxRowsPerStatement) {
          statementBatches.push(
            formatSqlServerInsertValuesStatement(
              parsedStatement.prefix,
              parsedStatement.rows.slice(index, index + maxRowsPerStatement)
            )
          );
        }

        updatedQuery += query.slice(cursor, startIndex);
        updatedQuery += statementBatches.join('\n\n');
        cursor = parsedStatement.endIndex;
        insertPattern.lastIndex = parsedStatement.endIndex;
        hasChanges = true;
      }
    }

    match = insertPattern.exec(query);
  }

  if (!hasChanges) {
    return query;
  }

  return `${updatedQuery}${query.slice(cursor)}`;
}

export function wrapSqlServerInsertScriptsWithConstraintHandling(query) {
  const statements = splitTopLevelSqlStatements(query);

  if (
    statements.length === 0 ||
    !statements.every((statement) => /^\s*INSERT\s+INTO\b/i.test(statement))
  ) {
    return query;
  }

  const targetTables = collectSqlServerInsertTargetTables(statements);

  if (targetTables.length === 0) {
    return query;
  }

  const disableConstraints = targetTables
    .map(
      (tableName) =>
        `IF OBJECT_ID(N'${tableName}', N'U') IS NOT NULL\n  ALTER TABLE ${tableName} NOCHECK CONSTRAINT ALL;`
    )
    .join('\n');
  const enableConstraints = targetTables
    .map(
      (tableName) =>
        `IF OBJECT_ID(N'${tableName}', N'U') IS NOT NULL\n  ALTER TABLE ${tableName} WITH CHECK CHECK CONSTRAINT ALL;`
    )
    .join('\n');
  const indentedStatements = statements
    .map((statement) => statement.split('\n').map((line) => `  ${line}`).join('\n'))
    .join('\n\n');

  return [
    '-- SQL Server import wrapper: constraints are temporarily disabled for insert-only loads.',
    '-- If final constraint revalidation fails, referenced parent rows are missing and the transaction rolls back.',
    '',
    'BEGIN TRY',
    '  BEGIN TRANSACTION;',
    '',
    disableConstraints,
    '',
    indentedStatements,
    '',
    enableConstraints,
    '',
    '  COMMIT TRANSACTION;',
    'END TRY',
    'BEGIN CATCH',
    '  IF @@TRANCOUNT > 0',
    '    ROLLBACK TRANSACTION;',
    '  THROW;',
    'END CATCH;'
  ].join('\n');
}

export function convertUpdatedAtTriggerToSqlServer(query) {
  return query.replace(
    /create\s+trigger\s+([A-Za-z_][\w$]*)\s+before\s+update\s+on\s+((?:\[[^\]]+\]|[A-Za-z_][\w$]*)(?:\.(?:\[[^\]]+\]|[A-Za-z_][\w$]*))?)\s+for\s+each\s+row\s+execute\s+function\s+([A-Za-z_][\w$]*)\s*\(\s*\)\s*;/gi,
    (_match, triggerName, tableName, functionName) => {
      if (functionName.toLowerCase() !== 'update_updated_at') {
        return `-- Manual rewrite required for PostgreSQL trigger ${triggerName} using function ${functionName}().`;
      }

      const formattedTriggerName = formatSqlServerObjectName(triggerName, true);
      const formattedTableName = formatSqlServerObjectName(tableName, true);
      const triggerDefinition = escapeSqlStringLiteral(
        `CREATE TRIGGER ${formattedTriggerName}\nON ${formattedTableName}\nAFTER UPDATE\nAS\nBEGIN\n  SET NOCOUNT ON;\n\n  IF UPDATE([updated_at])\n  BEGIN\n    RETURN;\n  END;\n\n  UPDATE target\n  SET [updated_at] = SYSDATETIMEOFFSET()\n  FROM ${formattedTableName} AS target\n  INNER JOIN inserted AS source\n    ON target.[id] = source.[id];\nEND;`
      );

      return `IF OBJECT_ID(N'${formattedTableName}', N'U') IS NOT NULL\nBEGIN\n  IF OBJECT_ID(N'${formattedTriggerName}', N'TR') IS NOT NULL\n    DROP TRIGGER ${formattedTriggerName};\n\n  EXEC(N'${triggerDefinition}');\nEND;`;
    }
  );
}

export function convertTopToLimit(query) {
  let limit = null;
  let updatedQuery = query;

  updatedQuery = updatedQuery.replace(
    /^\s*SELECT\s+DISTINCT\s+TOP\s*\(?\s*(\d+)\s*\)?\s+/i,
    (_match, value) => {
      limit = value;
      return 'SELECT DISTINCT ';
    }
  );

  if (!limit) {
    updatedQuery = updatedQuery.replace(
      /^\s*SELECT\s+TOP\s*\(?\s*(\d+)\s*\)?\s+/i,
      (_match, value) => {
        limit = value;
        return 'SELECT ';
      }
    );
  }

  if (!limit) {
    return query;
  }

  const trimmedQuery = updatedQuery.trimEnd();

  if (trimmedQuery.endsWith(';')) {
    return `${trimmedQuery.slice(0, -1)} LIMIT ${limit};`;
  }

  return `${trimmedQuery} LIMIT ${limit}`;
}

export function convertNowToGetDate(query) {
  return query.replace(/\bNOW\(\)/gi, 'GETDATE()');
}

export function convertSqlServerOffsetDefaults(query) {
  return query.replace(
    /\bDATETIMEOFFSET\b([^,\n]*?)\bDEFAULT\s+GETDATE\(\)/gi,
    (_match, segment) => `DATETIMEOFFSET${segment}DEFAULT SYSDATETIMEOFFSET()`
  );
}

function normalizeSqlServerDateTimeOffset(offset = '') {
  if (/^z$/i.test(offset)) {
    return '+00:00';
  }

  if (/^[+-]\d{2}$/.test(offset)) {
    return `${offset}:00`;
  }

  if (/^[+-]\d{4}$/.test(offset)) {
    return `${offset.slice(0, 3)}:${offset.slice(3)}`;
  }

  return offset;
}

export function convertPostgresTimestampLiteralsToSqlServer(query) {
  return query.replace(
    /'(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2}(?:\.\d{1,7})?)(Z|[+-]\d{2}(?::?\d{2})?)'/gi,
    (_match, datePart, timePart, offsetPart) => {
      const normalizedOffset = normalizeSqlServerDateTimeOffset(offsetPart);

      return `'${datePart}T${timePart}${normalizedOffset}'`;
    }
  );
}

export function convertGetDateToNow(query) {
  return query.replace(/\bGETDATE\(\)/gi, 'NOW()');
}

export function convertBooleanToBit(query) {
  return query
    .replace(/\bBOOLEAN\b/gi, 'BIT')
    .replace(/\bTRUE\b/gi, '1')
    .replace(/\bFALSE\b/gi, '0');
}

export function convertMySqlBooleanToBit(query) {
  return query
    .replace(/\bTINYINT\s*\(\s*1\s*\)\b/gi, 'BIT')
    .replace(/\bBOOLEAN\b/gi, 'BIT')
    .replace(/\bTRUE\b/gi, '1')
    .replace(/\bFALSE\b/gi, '0');
}

export function convertBooleanToTinyInt(query) {
  return query
    .replace(/\bBOOLEAN\b/gi, 'TINYINT(1)')
    .replace(/\bBIT\b/gi, 'TINYINT(1)')
    .replace(/\bTRUE\b/gi, '1')
    .replace(/\bFALSE\b/gi, '0');
}

export function convertBitToBoolean(query) {
  return query
    .replace(/\bTINYINT\s*\(\s*1\s*\)\b/gi, 'BOOLEAN')
    .replace(/\bBIT\b/gi, 'BOOLEAN');
}

export function convertSerialToAutoIncrement(query) {
  return query
    .replace(/\bBIGSERIAL\b([^,\n)]*)/gi, (_match, constraints) => {
      return `BIGINT${formatConstraintSegment(constraints)} AUTO_INCREMENT`;
    })
    .replace(/\bSERIAL\b([^,\n)]*)/gi, (_match, constraints) => {
      return `INT${formatConstraintSegment(constraints)} AUTO_INCREMENT`;
    });
}

export function convertSerialToIdentity(query) {
  return query
    .replace(/\bBIGSERIAL\b([^,\n)]*)/gi, (_match, constraints) => {
      return `BIGINT IDENTITY(1,1)${formatConstraintSegment(constraints)}`;
    })
    .replace(/\bSERIAL\b([^,\n)]*)/gi, (_match, constraints) => {
      return `INT IDENTITY(1,1)${formatConstraintSegment(constraints)}`;
    });
}

export function convertAutoIncrementToSerial(query) {
  return query
    .replace(/\bBIGINT\b([^,\n)]*?)\bAUTO_INCREMENT\b/gi, (_match, constraints) => {
      return `BIGSERIAL${formatConstraintSegment(constraints)}`;
    })
    .replace(/\b(?:INT|INTEGER)\b([^,\n)]*?)\bAUTO_INCREMENT\b/gi, (_match, constraints) => {
      return `SERIAL${formatConstraintSegment(constraints)}`;
    })
    .replace(/\s+AUTO_INCREMENT\b/gi, '');
}

export function convertAutoIncrementToIdentity(query) {
  return query
    .replace(/\bBIGINT\b([^,\n)]*?)\bAUTO_INCREMENT\b/gi, (_match, constraints) => {
      return `BIGINT IDENTITY(1,1)${formatConstraintSegment(constraints)}`;
    })
    .replace(/\b(?:INT|INTEGER)\b([^,\n)]*?)\bAUTO_INCREMENT\b/gi, (_match, constraints) => {
      return `INT IDENTITY(1,1)${formatConstraintSegment(constraints)}`;
    })
    .replace(/\s+AUTO_INCREMENT\b/gi, '');
}

export function convertIdentityToSerial(query) {
  return query
    .replace(
      /\bBIGINT\b\s+IDENTITY\s*(?:\(\s*\d+\s*,\s*\d+\s*\))?([^,\n)]*)/gi,
      (_match, constraints) => `BIGSERIAL${formatConstraintSegment(constraints)}`
    )
    .replace(
      /\b(?:INT|INTEGER)\b\s+IDENTITY\s*(?:\(\s*\d+\s*,\s*\d+\s*\))?([^,\n)]*)/gi,
      (_match, constraints) => `SERIAL${formatConstraintSegment(constraints)}`
    );
}

export function convertIdentityToAutoIncrement(query) {
  return query
    .replace(
      /\bBIGINT\b\s+IDENTITY\s*(?:\(\s*\d+\s*,\s*\d+\s*\))?([^,\n)]*)/gi,
      (_match, constraints) => `BIGINT${formatConstraintSegment(constraints)} AUTO_INCREMENT`
    )
    .replace(
      /\b(?:INT|INTEGER)\b\s+IDENTITY\s*(?:\(\s*\d+\s*,\s*\d+\s*\))?([^,\n)]*)/gi,
      (_match, constraints) => `INT${formatConstraintSegment(constraints)} AUTO_INCREMENT`
    );
}

export function convertIdentifierQuotesToSqlServer(query) {
  return query.replace(/`([^`]+)`/g, '[$1]').replace(/"([^"]+)"/g, '[$1]');
}

export function convertIdentifierQuotesToPostgres(query) {
  return query.replace(/`([^`]+)`/g, '"$1"').replace(/\[([^\]]+)\]/g, '"$1"');
}

export function convertIdentifierQuotesToMySql(query) {
  return query.replace(/"([^"]+)"/g, '`$1`').replace(/\[([^\]]+)\]/g, '`$1`');
}

export function convertILikeToLike(query) {
  return query.replace(/\bILIKE\b/gi, 'LIKE');
}

export function removeMySqlEngineClause(query) {
  return query.replace(/\)\s*ENGINE\s*=\s*\w+/gi, ')');
}

export function removePostgresTablespaceClauses(query) {
  return query.replace(/\s+TABLESPACE\s+[A-Za-z_][\w$]*/gi, '');
}

export function removeSqlServerBatchSeparators(query) {
  return query.replace(/^\s*GO\s*$/gim, '').trim();
}

export function convertSqlServerTextTypes(query) {
  return query.replace(/\bNVARCHAR\b/gi, 'VARCHAR');
}
