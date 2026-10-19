/**
 * 表单控件：每个控件都自带 `<label>`，错误文案通过 `aria-describedby` 关联（PRD §5.8）。
 * 错误来自 `useSubmitState` 的 `fieldErrors`（后端/校验返回的字段级错误）。
 */

type BaseFieldProps = {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
};

function describedBy(id: string, hint?: string, error?: string): string | undefined {
  const ids: string[] = [];
  if (hint) ids.push(`${id}-hint`);
  if (error) ids.push(`${id}-error`);
  return ids.length > 0 ? ids.join(' ') : undefined;
}

function FieldMessages({ id, hint, error }: { id: string; hint?: string; error?: string }) {
  return (
    <>
      {hint ? (
        <p className="field__hint" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className="field__error" id={`${id}-error`} role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
}

function Label({
  id,
  label,
  required,
}: {
  id: string;
  label: string;
  required?: boolean;
}) {
  return (
    <label className="field__label" htmlFor={id}>
      {label}
      {required ? (
        <span className="field__required" aria-hidden="true">
          {' '}
          *
        </span>
      ) : null}
    </label>
  );
}

type TextFieldProps = BaseFieldProps & {
  value: string;
  onChange: (value: string) => void;
  type?: 'text' | 'email' | 'url' | 'number' | 'search';
  placeholder?: string;
  autoComplete?: string;
};

export function TextField({
  id,
  label,
  value,
  onChange,
  hint,
  error,
  required,
  disabled,
  type = 'text',
  placeholder,
  autoComplete,
}: TextFieldProps) {
  return (
    <div className="field">
      <Label id={id} label={label} required={required} />
      <input
        id={id}
        className={error ? 'input input--error' : 'input'}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        aria-describedby={describedBy(id, hint, error)}
        aria-invalid={error ? true : undefined}
        required={required}
        disabled={disabled}
      />
      <FieldMessages id={id} hint={hint} error={error} />
    </div>
  );
}

type TextAreaFieldProps = BaseFieldProps & {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  wide?: boolean;
};

export function TextAreaField({
  id,
  label,
  value,
  onChange,
  hint,
  error,
  required,
  disabled,
  placeholder,
  rows = 6,
  wide,
}: TextAreaFieldProps) {
  return (
    <div className={wide ? 'field field--wide' : 'field'}>
      <Label id={id} label={label} required={required} />
      <textarea
        id={id}
        className={error ? 'textarea textarea--error' : 'textarea'}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        rows={rows}
        aria-describedby={describedBy(id, hint, error)}
        aria-invalid={error ? true : undefined}
        required={required}
        disabled={disabled}
      />
      <FieldMessages id={id} hint={hint} error={error} />
    </div>
  );
}

export type SelectOption = { value: string; label: string };

type SelectFieldProps = BaseFieldProps & {
  value: string;
  onChange: (value: string) => void;
  options: readonly SelectOption[];
};

export function SelectField({
  id,
  label,
  value,
  onChange,
  options,
  hint,
  error,
  required,
  disabled,
}: SelectFieldProps) {
  return (
    <div className="field">
      <Label id={id} label={label} required={required} />
      <select
        id={id}
        className={error ? 'select select--error' : 'select'}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-describedby={describedBy(id, hint, error)}
        aria-invalid={error ? true : undefined}
        required={required}
        disabled={disabled}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <FieldMessages id={id} hint={hint} error={error} />
    </div>
  );
}

type CheckboxFieldProps = {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hint?: string;
  error?: string;
  disabled?: boolean;
};

export function CheckboxField({
  id,
  label,
  checked,
  onChange,
  hint,
  error,
  disabled,
}: CheckboxFieldProps) {
  return (
    <div className="field field--checkbox">
      <label className="field__checkbox-label" htmlFor={id}>
        <input
          id={id}
          type="checkbox"
          className="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          aria-describedby={describedBy(id, hint, error)}
          aria-invalid={error ? true : undefined}
          disabled={disabled}
        />
        <span>{label}</span>
      </label>
      <FieldMessages id={id} hint={hint} error={error} />
    </div>
  );
}
