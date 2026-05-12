import {
  applyTransformers,
  convertAutoIncrementToIdentity,
  convertLargeInsertStatementsToSqlServer,
  convertIdentifierQuotesToSqlServer,
  convertLimitToTop,
  convertMySqlBooleanToBit,
  convertNowToGetDate,
  wrapSqlServerInsertScriptsWithConstraintHandling,
  removeMySqlEngineClause
} from '../shared/transformers.js';

export function mysqlToSqlServer(query) {
  return applyTransformers(
    query,
    removeMySqlEngineClause,
    convertIdentifierQuotesToSqlServer,
    convertAutoIncrementToIdentity,
    convertMySqlBooleanToBit,
    convertNowToGetDate,
    convertLargeInsertStatementsToSqlServer,
    wrapSqlServerInsertScriptsWithConstraintHandling,
    convertLimitToTop
  );
}
