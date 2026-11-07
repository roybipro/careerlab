/**
 * The request body for a form of text fields. Values are trimmed. An emptied optional field becomes
 * `null` on edit, which clears it, and is left out on create. Fields in `required` are never null: an
 * emptied one is sent as an empty string and the API rejects it with a message for that field.
 */
export function buildBody<F extends string>(
  values: Record<F, string>,
  fields: readonly F[],
  isCreate: boolean,
  required: readonly F[],
): Record<string, string | null> {
  const body: Record<string, string | null> = {};
  for (const field of fields) {
    const v = values[field].trim();
    if (required.includes(field)) body[field] = v;
    else if (v !== "") body[field] = v;
    else if (!isCreate) body[field] = null;
  }
  return body;
}
