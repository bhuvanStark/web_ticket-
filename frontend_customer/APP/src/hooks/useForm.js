import { useCallback, useState } from 'react';
import { validateField, validateForm } from '../utils/validation/index.js';

// Small form-state hook with blur + submit validation.
//
//   const f = useForm({ email: '', password: '' }, {
//     email: [required(), email()],
//     password: [required(), minLength(6)],
//   });
//
//   <input {...f.field('email')} />
//   {f.errors.email && f.touched.email && <p>{f.errors.email}</p>}
//
//   const onSubmit = f.handleSubmit(async (values) => { ... });
//
// field() spreads value / onChange / onBlur onto a native input. For selects and
// custom controls, use f.setValue(name, v) directly.
export function useForm(initialValues = {}, ruleMap = {}) {
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const revalidate = useCallback((name, nextValues) => {
    if (!ruleMap[name]) return;
    setErrors((prev) => {
      const error = validateField(nextValues[name], ruleMap[name], nextValues);
      const next = { ...prev };
      if (error) next[name] = error;
      else delete next[name];
      return next;
    });
  }, [ruleMap]);

  const setValue = useCallback((name, value) => {
    setValues((prev) => {
      const next = { ...prev, [name]: value };
      revalidate(name, next);
      return next;
    });
  }, [revalidate]);

  const handleChange = useCallback((e) => {
    const { name, value, type, checked } = e.target;
    setValue(name, type === 'checkbox' ? checked : value);
  }, [setValue]);

  const handleBlur = useCallback((e) => {
    const { name } = e.target;
    setTouched((prev) => ({ ...prev, [name]: true }));
    setValues((prev) => { revalidate(name, prev); return prev; });
  }, [revalidate]);

  const field = useCallback((name) => ({
    name,
    value: values[name] ?? '',
    onChange: handleChange,
    onBlur: handleBlur,
  }), [values, handleChange, handleBlur]);

  const validateAll = useCallback(() => {
    const allErrors = validateForm(values, ruleMap);
    setErrors(allErrors);
    setTouched(Object.keys(ruleMap).reduce((acc, k) => { acc[k] = true; return acc; }, {}));
    return allErrors;
  }, [values, ruleMap]);

  const handleSubmit = useCallback((onValid) => async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    const allErrors = validateAll();
    if (Object.keys(allErrors).length > 0) return;
    setIsSubmitting(true);
    try {
      await onValid(values);
    } finally {
      setIsSubmitting(false);
    }
  }, [validateAll, values]);

  const reset = useCallback((next = initialValues) => {
    setValues(next);
    setErrors({});
    setTouched({});
    setIsSubmitting(false);
  }, [initialValues]);

  // True error to show for a field: only after it's been touched.
  const showError = useCallback((name) => (touched[name] ? errors[name] : null), [touched, errors]);

  return {
    values, errors, touched, isSubmitting,
    setValue, setValues, field, handleChange, handleBlur,
    handleSubmit, validateAll, reset, showError,
    isValid: Object.keys(errors).length === 0,
  };
}
