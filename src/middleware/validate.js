import { AppError } from '../utils/AppError.js';

/**
 * @param {import('zod').ZodTypeAny} schema
 * @param {'body' | 'query' | 'params' | 'all'} [source='body']
 */
export function validate(schema, source = 'body') {
  return (req, _res, next) => {
    const payload =
      source === 'all'
        ? { body: req.body, query: req.query, params: req.params }
        : req[source];

    const result = schema.safeParse(payload);
    if (!result.success) {
      return next(
        new AppError('Request validation failed', 400, {
          code: 'VALIDATION_ERROR',
          details: result.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        }),
      );
    }

    if (source === 'all') {
      req.body = result.data.body ?? req.body;
      req.query = result.data.query ?? req.query;
      req.params = result.data.params ?? req.params;
    } else {
      req[source] = result.data;
    }

    return next();
  };
}

export default validate;
