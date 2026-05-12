import {
  applyTransformers,
  convertBitToBoolean,
  convertGetDateToNow,
  convertIdentifierQuotesToPostgres,
  convertIdentityToSerial,
  convertSqlServerTextTypes,
  convertTopToLimit,
  removeSqlServerBatchSeparators
} from '../shared/transformers.js';

export function sqlServerToPostgres(query) {
  return applyTransformers(
    query,
    removeSqlServerBatchSeparators,
    convertIdentifierQuotesToPostgres,
    convertIdentityToSerial,
    convertBitToBoolean,
    convertSqlServerTextTypes,
    convertGetDateToNow,
    convertTopToLimit
  );
}
