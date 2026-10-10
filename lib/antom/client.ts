import 'server-only';
import { antomConfig } from './config';
import { antomPostWithConfig } from './transport';

export { AntomApiError } from './transport';

/** Keep the existing server API; transport verifies responses before parsing. */
export async function antomPost<T>(
  path: string,
  payload: unknown,
  options: { timeoutMs?: number } = {},
): Promise<T> {
  return antomPostWithConfig<T>(antomConfig, path, payload, options);
}
