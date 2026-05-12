import {
  applyTransformers,
  convertBooleanToTinyInt,
  convertGetDateToNow,
  convertIdentifierQuotesToMySql,
  convertIdentityToAutoIncrement,
  convertSqlServerTextTypes,
  convertTopToLimit,
  removeSqlServerBatchSeparators
} from '../shared/transformers.js';

export function sqlServerToMySql(query) {
  return applyTransformers(
    query,
    removeSqlServerBatchSeparators,
    convertIdentifierQuotesToMySql,
    convertIdentityToAutoIncrement,
    convertBooleanToTinyInt,
    convertSqlServerTextTypes,
    convertGetDateToNow,
    convertTopToLimit
  );
}
