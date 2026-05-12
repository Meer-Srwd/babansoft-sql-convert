import {
  applyTransformers,
  convertBooleanToTinyInt,
  convertIdentifierQuotesToMySql,
  convertILikeToLike,
  convertSerialToAutoIncrement
} from '../shared/transformers.js';

export function postgresToMySql(query) {
  return applyTransformers(
    query,
    convertIdentifierQuotesToMySql,
    convertSerialToAutoIncrement,
    convertBooleanToTinyInt,
    convertILikeToLike
  );
}
