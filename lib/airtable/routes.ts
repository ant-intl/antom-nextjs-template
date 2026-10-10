import 'server-only';
import { createAirtableHandlers } from './http';
import { getAirtableRuntime } from './runtime';

export const airtableHandlers = createAirtableHandlers(getAirtableRuntime);
