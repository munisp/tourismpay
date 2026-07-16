import { useState, useCallback, useMemo } from "react";

export type ValidationRule = {
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  email?: boolean;
  phone?: boolean;
  nin?: boolean;
  bvn?: boolean;
  custom?: (value: string) => string | null;
};

export type ValidationRules<T> = {
  [K in keyof T]?: ValidationRule;
};

export type ValidationErrors<T> = {
  [K in keyof T]?: string;
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^(\+234|0)[789][01]\d{8}$/;
const NIN_REGEX = /^\d{11}$/;
const BVN_REGEX = /^\d{11}$/;

const getErrorMessage = (rule: ValidationRule, fieldName: string, value: string): string | null => {
  if (rule.required && (!value || value.trim() === "")) {
    return `${fieldName} is required`;
  }

  if (value && rule.minLength && value.length < rule.minLength) {
    return `${fieldName} must be at least ${rule.minLength} characters`;
  }

  if (value && rule.maxLength && value.length > rule.maxLength) {
    return `${fieldName} must be no more than ${rule.maxLength} characters`;
  }

  if (value && rule.pattern && !rule.pattern.test(value)) {
    return `${fieldName} format is invalid`;
  }

  if (value && rule.email && !EMAIL_REGEX.test(value)) {
    return "Please enter a valid email address";
  }

  if (value && rule.phone && !PHONE_REGEX.test(value.replace(/\s/g, ""))) {
    return "Please enter a valid Nigerian phone number (e.g., 08012345678)";
  }

  if (value && rule.nin && !NIN_REGEX.test(value)) {
    return "NIN must be exactly 11 digits";
  }

  if (value && rule.bvn && !BVN_REGEX.test(value)) {
    return "BVN must be exactly 11 digits";
  }

  if (value && rule.custom) {
    return rule.custom(value);
  }

  return null;
};

export function useFormValidation<T extends Record<string, string>>(
  initialValues: T,
  rules: ValidationRules<T>
) {
  const [values, setValues] = useState<T>(initialValues);
  const [errors, setErrors] = useState<ValidationErrors<T>>({});
  const [touched, setTouched] = useState<Record<keyof T, boolean>>({} as Record<keyof T, boolean>);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validateField = useCallback(
    (name: keyof T, value: string): string | null => {
      const rule = rules[name];
      if (!rule) return null;

      const fieldName = String(name)
        .replace(/([A-Z])/g, " $1")
        .replace(/^./, (str) => str.toUpperCase())
        .trim();

      return getErrorMessage(rule, fieldName, value);
    },
    [rules]
  );

  const validateAll = useCallback((): boolean => {
    const newErrors: ValidationErrors<T> = {};
    let isValid = true;

    for (const key of Object.keys(rules) as Array<keyof T>) {
      const error = validateField(key, values[key]);
      if (error) {
        newErrors[key] = error;
        isValid = false;
      }
    }

    setErrors(newErrors);
    return isValid;
  }, [rules, values, validateField]);

  const handleChange = useCallback(
    (name: keyof T) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      const value = e.target.value;
      setValues((prev) => ({ ...prev, [name]: value }));

      if (touched[name]) {
        const error = validateField(name, value);
        setErrors((prev) => ({ ...prev, [name]: error || undefined }));
      }
    },
    [touched, validateField]
  );

  const handleBlur = useCallback(
    (name: keyof T) => () => {
      setTouched((prev) => ({ ...prev, [name]: true }));
      const error = validateField(name, values[name]);
      setErrors((prev) => ({ ...prev, [name]: error || undefined }));
    },
    [values, validateField]
  );

  const setValue = useCallback((name: keyof T, value: string) => {
    setValues((prev) => ({ ...prev, [name]: value }));
    if (touched[name]) {
      const error = validateField(name, value);
      setErrors((prev) => ({ ...prev, [name]: error || undefined }));
    }
  }, [touched, validateField]);

  const reset = useCallback(() => {
    setValues(initialValues);
    setErrors({});
    setTouched({} as Record<keyof T, boolean>);
    setIsSubmitting(false);
  }, [initialValues]);

  const handleSubmit = useCallback(
    (onSubmit: (values: T) => Promise<void> | void) => async (e: React.FormEvent) => {
      e.preventDefault();
      
      const allTouched = Object.keys(rules).reduce(
        (acc, key) => ({ ...acc, [key]: true }),
        {} as Record<keyof T, boolean>
      );
      setTouched(allTouched);

      if (!validateAll()) {
        return;
      }

      setIsSubmitting(true);
      try {
        await onSubmit(values);
      } finally {
        setIsSubmitting(false);
      }
    },
    [rules, validateAll, values]
  );

  const isValid = useMemo(() => {
    return Object.keys(rules).every((key) => {
      const error = validateField(key as keyof T, values[key as keyof T]);
      return !error;
    });
  }, [rules, values, validateField]);

  const getFieldProps = useCallback(
    (name: keyof T) => ({
      value: values[name],
      onChange: handleChange(name),
      onBlur: handleBlur(name),
      "aria-invalid": !!errors[name],
      "aria-describedby": errors[name] ? `${String(name)}-error` : undefined,
    }),
    [values, handleChange, handleBlur, errors]
  );

  return {
    values,
    errors,
    touched,
    isSubmitting,
    isValid,
    handleChange,
    handleBlur,
    handleSubmit,
    setValue,
    setValues,
    validateField,
    validateAll,
    reset,
    getFieldProps,
  };
}

export function FormError({ id, error }: { id: string; error?: string }) {
  if (!error) return null;
  
  return (
    <p
      id={id}
      role="alert"
      aria-live="polite"
      className="mt-1 text-sm text-red-600"
    >
      {error}
    </p>
  );
}
