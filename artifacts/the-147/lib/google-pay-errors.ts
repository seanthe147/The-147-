export interface GooglePayErrorContext {
  message: string;
  code: string | null;
  debugCode: string | null;
  debugMessage: string | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function parseErrorValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isAndroidResourceId(value: string | null): boolean {
  // The Square React Native bridge has a known defect in its generic error
  // formatter: R.string.<id>.toString() produces the numeric Android resource
  // ID (for example, 2131886391) instead of the localized message.
  return !!value && /^\d{7,}$/.test(value);
}

function findGooglePayCode(values: Array<string | null>): string | null {
  for (const value of values) {
    if (!value) continue;
    const match = value.match(/\bOR_[A-Z0-9_]+\b/i);
    if (match) return match[0].toUpperCase();
  }
  return null;
}

/**
 * Square's native bridge can return either an ErrorDetails object or an Error
 * whose message contains a JSON-encoded ErrorDetails object. Keep all useful
 * fields for diagnostics while returning only a safe, concise message to the
 * customer.
 */
export function normalizeGooglePayError(value: unknown): GooglePayErrorContext {
  const parsed = parseErrorValue(value);
  const record = asRecord(parsed);
  const rawMessage =
    parsed instanceof Error
      ? parsed.message
      : typeof parsed === "string"
        ? parsed
        : record?.message;
  const nested = parseErrorValue(rawMessage);
  const nestedRecord = asRecord(nested);
  const debugMessage =
    stringValue(nestedRecord?.debugMessage) || stringValue(record?.debugMessage);
  const messageCandidate =
    stringValue(nestedRecord?.message) ||
    stringValue(rawMessage);
  const message =
    (!isAndroidResourceId(messageCandidate) ? messageCandidate : null) ||
    debugMessage ||
    "Google Pay could not complete.";
  const code = stringValue(nestedRecord?.code) || stringValue(record?.code);
  const debugCode = stringValue(nestedRecord?.debugCode) || stringValue(record?.debugCode);

  return {
    message,
    code,
    debugCode,
    debugMessage,
  };
}

export function googlePayCustomerMessage(error: GooglePayErrorContext): string {
  const code = findGooglePayCode([error.code, error.debugCode, error.message, error.debugMessage]);
  if (code === "OR_BIBED_11") {
    return (
      "Google Pay could not be accepted by the merchant or wallet configuration " +
      "(OR_BIBED_11). No charge was made. Please use card details below. " +
      "If this keeps happening, update Google Pay or contact the venue."
    );
  }
  if (error.debugCode === "rn_google_pay_result_error") {
    return (
      "Google Pay could not complete the wallet request. No charge was made. " +
      "Please use card details below. If this keeps happening, update Google Pay " +
      "or contact the venue."
    );
  }
  if (/not initialized|not available|unsupported/i.test(error.message)) {
    return "Google Pay is not available on this device. Please use card details below.";
  }
  return `${error.message} You can still pay by entering your card details below.`;
}

export function googlePayDiagnosticCode(error: GooglePayErrorContext): string | null {
  return findGooglePayCode([error.code, error.debugCode, error.message, error.debugMessage]);
}