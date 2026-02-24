/**
 * GuestDetailsForm — collects guest name, email, timezone, and optional notes.
 */
import { useState, useRef, useEffect, useId } from 'react';
import { z } from 'zod';
import { guestNameSchema, guestEmailSchema, guestTimezoneSchema, notesSchema } from '@/lib/validation';

export interface GuestDetails {
  guestName: string;
  guestEmail: string;
  timezone: string;
  notes: string;
}

interface GuestDetailsFormProps {
  initialValues: GuestDetails;
  timezoneList: string[];
  isDetectedTimezone: boolean;
  onChange: (values: GuestDetails) => void;
  onSubmit: (values: GuestDetails) => void;
  onBack: () => void;
  submitting?: boolean;
}

const formSchema = z.object({
  guestName: guestNameSchema,
  guestEmail: guestEmailSchema,
  timezone: guestTimezoneSchema,
  notes: notesSchema,
});

type FormErrors = Partial<Record<keyof GuestDetails, string>>;

export function GuestDetailsForm({
  initialValues,
  timezoneList,
  isDetectedTimezone,
  onChange,
  onSubmit,
  onBack,
  submitting = false,
}: GuestDetailsFormProps) {
  const [values, setValues] = useState<GuestDetails>(initialValues);
  const [errors, setErrors] = useState<FormErrors>({});
  const [tzSearch, setTzSearch] = useState('');
  const [tzOpen, setTzOpen] = useState(false);
  const tzInputRef = useRef<HTMLInputElement>(null);
  const tzListRef = useRef<HTMLUListElement>(null);

  const nameId = useId();
  const emailId = useId();
  const tzId = useId();
  const notesId = useId();

  // Sync display timezone search with current value
  useEffect(() => {
    setTzSearch(values.timezone);
  }, [values.timezone]);

  const update = (field: keyof GuestDetails, value: string) => {
    const next = { ...values, [field]: value };
    setValues(next);
    onChange(next);
    // Clear error on change
    if (errors[field]) {
      setErrors((e) => ({ ...e, [field]: undefined }));
    }
  };

  const filteredTimezones = tzSearch.length >= 1
    ? timezoneList.filter((tz) =>
        tz.toLowerCase().includes(tzSearch.toLowerCase())
      ).slice(0, 50)
    : timezoneList.slice(0, 50);

  const handleTzInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTzSearch(e.target.value);
    setTzOpen(true);
  };

  const handleTzSelect = (tz: string) => {
    update('timezone', tz);
    setTzSearch(tz);
    setTzOpen(false);
    tzInputRef.current?.blur();
  };

  const handleTzBlur = (e: React.FocusEvent) => {
    // Only close if focus isn't moving to the list
    if (!tzListRef.current?.contains(e.relatedTarget as Node)) {
      setTzOpen(false);
      // Restore search to current value
      setTzSearch(values.timezone);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const result = formSchema.safeParse(values);
    if (!result.success) {
      const fieldErrors: FormErrors = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0] as keyof GuestDetails;
        if (!fieldErrors[field]) {
          fieldErrors[field] = issue.message;
        }
      }
      setErrors(fieldErrors);
      return;
    }
    onSubmit(values);
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      {!isDetectedTimezone && (
        <div
          className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800"
          role="alert"
        >
          We couldn't detect your timezone. Times are shown in UTC — please select yours below.
        </div>
      )}

      {/* Guest Name */}
      <div>
        <label htmlFor={nameId} className="block text-sm font-medium text-gray-700 mb-1">
          Your name <span className="text-red-500" aria-hidden="true">*</span>
        </label>
        <input
          id={nameId}
          type="text"
          value={values.guestName}
          onChange={(e) => update('guestName', e.target.value)}
          autoComplete="name"
          required
          aria-required="true"
          aria-describedby={errors.guestName ? `${nameId}-error` : undefined}
          aria-invalid={!!errors.guestName}
          className={[
            'w-full min-h-[44px] px-3 py-2.5 rounded-lg border text-sm',
            'focus:outline-2 focus:outline-offset-2 focus:outline-accent',
            'transition-colors duration-150',
            errors.guestName
              ? 'border-red-400 bg-red-50'
              : 'border-gray-300 bg-white',
          ].join(' ')}
          placeholder="Your full name"
        />
        {errors.guestName && (
          <p id={`${nameId}-error`} className="mt-1 text-xs text-red-600" role="alert">
            {errors.guestName}
          </p>
        )}
      </div>

      {/* Guest Email */}
      <div>
        <label htmlFor={emailId} className="block text-sm font-medium text-gray-700 mb-1">
          Email address <span className="text-red-500" aria-hidden="true">*</span>
        </label>
        <input
          id={emailId}
          type="email"
          value={values.guestEmail}
          onChange={(e) => update('guestEmail', e.target.value)}
          autoComplete="email"
          required
          aria-required="true"
          aria-describedby={errors.guestEmail ? `${emailId}-error` : undefined}
          aria-invalid={!!errors.guestEmail}
          className={[
            'w-full min-h-[44px] px-3 py-2.5 rounded-lg border text-sm',
            'focus:outline-2 focus:outline-offset-2 focus:outline-accent',
            'transition-colors duration-150',
            errors.guestEmail
              ? 'border-red-400 bg-red-50'
              : 'border-gray-300 bg-white',
          ].join(' ')}
          placeholder="you@example.com"
        />
        {errors.guestEmail && (
          <p id={`${emailId}-error`} className="mt-1 text-xs text-red-600" role="alert">
            {errors.guestEmail}
          </p>
        )}
      </div>

      {/* Timezone */}
      <div className="relative">
        <label htmlFor={tzId} className="block text-sm font-medium text-gray-700 mb-1">
          Your timezone <span className="text-red-500" aria-hidden="true">*</span>
        </label>
        <input
          id={tzId}
          ref={tzInputRef}
          type="text"
          value={tzSearch}
          onChange={handleTzInputChange}
          onFocus={() => setTzOpen(true)}
          onBlur={handleTzBlur}
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={tzOpen}
          aria-controls={`${tzId}-list`}
          aria-describedby={errors.timezone ? `${tzId}-error` : undefined}
          aria-invalid={!!errors.timezone}
          role="combobox"
          className={[
            'w-full min-h-[44px] px-3 py-2.5 rounded-lg border text-sm',
            'focus:outline-2 focus:outline-offset-2 focus:outline-accent',
            'transition-colors duration-150',
            errors.timezone
              ? 'border-red-400 bg-red-50'
              : 'border-gray-300 bg-white',
          ].join(' ')}
          placeholder="Search timezone..."
        />
        {errors.timezone && (
          <p id={`${tzId}-error`} className="mt-1 text-xs text-red-600" role="alert">
            {errors.timezone}
          </p>
        )}
        {tzOpen && filteredTimezones.length > 0 && (
          <ul
            id={`${tzId}-list`}
            ref={tzListRef}
            role="listbox"
            aria-label="Timezone options"
            className="absolute z-20 w-full mt-1 max-h-48 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg"
          >
            {filteredTimezones.map((tz) => (
              <li
                key={tz}
                role="option"
                aria-selected={tz === values.timezone}
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleTzSelect(tz);
                }}
                className={[
                  'px-3 py-2.5 text-sm cursor-pointer min-h-[44px] flex items-center',
                  tz === values.timezone
                    ? 'bg-blue-50 text-accent font-medium'
                    : 'text-gray-700 hover:bg-gray-50',
                ].join(' ')}
              >
                {tz}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Notes */}
      <div>
        <label htmlFor={notesId} className="block text-sm font-medium text-gray-700 mb-1">
          Notes{' '}
          <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <textarea
          id={notesId}
          value={values.notes}
          onChange={(e) => update('notes', e.target.value)}
          rows={3}
          aria-describedby={errors.notes ? `${notesId}-error` : `${notesId}-hint`}
          aria-invalid={!!errors.notes}
          className={[
            'w-full px-3 py-2.5 rounded-lg border text-sm resize-y min-h-[80px]',
            'focus:outline-2 focus:outline-offset-2 focus:outline-accent',
            'transition-colors duration-150',
            errors.notes
              ? 'border-red-400 bg-red-50'
              : 'border-gray-300 bg-white',
          ].join(' ')}
          placeholder="Anything the practitioner should know before your session..."
        />
        <p id={`${notesId}-hint`} className="mt-1 text-xs text-gray-400">
          Max 500 characters
        </p>
        {errors.notes && (
          <p id={`${notesId}-error`} className="mt-1 text-xs text-red-600" role="alert">
            {errors.notes}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={onBack}
          disabled={submitting}
          className="min-h-[44px] flex-1 px-4 py-2.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50"
        >
          ← Back
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="min-h-[44px] flex-2 flex-1 px-4 py-2.5 rounded-lg bg-accent text-white text-sm font-medium hover:opacity-90 transition-opacity focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? 'Loading...' : 'Continue →'}
        </button>
      </div>
    </form>
  );
}
