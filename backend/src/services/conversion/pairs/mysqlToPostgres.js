import {
  applyTransformers,
  convertAutoIncrementToSerial,
  convertBitToBoolean,
  convertIdentifierQuotesToPostgres,
  removeMySqlEngineClause
} from '../shared/transformers.js';

export function mysqlToPostgres(query) {
  return applyTransformers(
    query,
    removeMySqlEngineClause,
    convertIdentifierQuotesToPostgres,
    convertAutoIncrementToSerial,
    convertBitToBoolean
  );
}
