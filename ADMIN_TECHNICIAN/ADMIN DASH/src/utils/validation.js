// Lightweight, dependency-free form validation.
//
// Usage:
//   const rules = {
//     email: [required(), email()],
//     password: [required(), minLength(6)],
//     confirm: [required(), matches('password', 'Passwords do not match')],
//   };
//   const errors = validateForm(values, rules); // { field: 'message', ... }
//
// Each rule is (value, allValues) => string | null. First failing rule wins.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Accepts +, spaces, dashes, parens; requires 7-15 digits total (E.164-ish).
const PHONE_DIGITS_RE = /\d/g;

export const required = (message = 'This field is required') => (value) => {
  if (value === undefined || value === null) return message;
  if (typeof value === 'string' && value.trim() === '') return message;
  if (Array.isArray(value) && value.length === 0) return message;
  return null;
};

export const email = (message = 'Enter a valid email address') => (value) => {
  if (!value) return null; // let required() own emptiness
  return EMAIL_RE.test(String(value).trim()) ? null : message;
};

export const phone = (message = 'Enter a valid phone number') => (value) => {
  if (!value) return null;
  const digits = String(value).match(PHONE_DIGITS_RE) || [];
  return digits.length >= 7 && digits.length <= 15 ? null : message;
};

export const minLength = (n, message) => (value) => {
  if (!value) return null;
  return String(value).length >= n ? null : (message || `Must be at least ${n} characters`);
};

export const maxLength = (n, message) => (value) => {
  if (!value) return null;
  return String(value).length <= n ? null : (message || `Must be at most ${n} characters`);
};

export const numberRange = ({ min, max, integer = false } = {}, message) => (value) => {
  if (value === '' || value === null || value === undefined) return null;
  const num = Number(value);
  if (Number.isNaN(num)) return message || 'Enter a valid number';
  if (integer && !Number.isInteger(num)) return message || 'Enter a whole number';
  if (min !== undefined && num < min) return message || `Must be ${min} or more`;
  if (max !== undefined && num > max) return message || `Must be ${max} or less`;
  return null;
};

export const matches = (otherField, message = 'Values do not match') => (value, allValues) => {
  if (!value) return null;
  return value === (allValues || {})[otherField] ? null : message;
};

export const pattern = (re, message = 'Invalid format') => (value) => {
  if (!value) return null;
  return re.test(String(value)) ? null : message;
};

// Run a single field's rules.
export function validateField(value, rules = [], allValues = {}) {
  for (const rule of rules) {
    const error = rule(value, allValues);
    if (error) return error;
  }
  return null;
}

// Run every field. Returns an object of only the fields that failed.
export function validateForm(values = {}, ruleMap = {}) {
  const errors = {};
  for (const field of Object.keys(ruleMap)) {
    const error = validateField(values[field], ruleMap[field], values);
    if (error) errors[field] = error;
  }
  return errors;
}
