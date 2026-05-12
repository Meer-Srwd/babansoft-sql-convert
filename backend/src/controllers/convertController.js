import { convertQuery } from '../services/conversion/index.js';

export function convertController(request, response, next) {
  const { query, fromDb, toDb, targetDatabaseName } = request.body ?? {};

  try {
    const convertedQuery = convertQuery({ query, fromDb, toDb, targetDatabaseName });
    response.json({ convertedQuery });
  } catch (error) {
    next(error);
  }
}
