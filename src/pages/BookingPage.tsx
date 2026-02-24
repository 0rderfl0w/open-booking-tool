/**
 * Public booking page: /book/:username
 * 5-step wizard: Session Type → Date → Time → Details → Confirmation
 */
import { useReducer, useEffect, useRef, useCallback } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/dist/style.css';
import { supabase } from '@/lib/supabase';
import { WIZARD_STEPS, type WizardStep } from '@/lib/constants';
import { useTimezone } from '@/hooks/useTimezone';
import { WizardProgress } from '@/components/booking/WizardProgress';
import { SessionTypeCard } from '@/components/booking/SessionTypeCard';
import { TimeSlotGrid } from '@/components/booking/TimeSlotGrid';
import { GuestDetailsForm, type GuestDetails } from '@/components/booking/GuestDetailsForm';
import { BookingSummary } from '@/components/booking/BookingSummary';
import { EmptyState } from '@/components/shared/EmptyState';
import type { PublicPractitioner, SessionType } from '@/types/database';
import type { Slot, SlotState, BookResponse } from '@/types/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface WizardState {
  step: WizardStep;
  // Practitioner data
  practitioner: PublicPractitioner | null;
  practitionerLoading: boolean;
  practitionerError: string | null;
  // Session types
  sessionTypes: SessionType[];
  selectedSessionType: SessionType | null;
  // Date
  selectedDate: Date | null;
  selectedDateStr: string | null; // YYYY-MM-DD
  // Time slots
  slots: Slot[];
  slotState: SlotState;
  slotLoading: boolean;
  selectedSlot: Slot | null;
  // Guest details
  guestDetails: GuestDetails;
  // Submission
  submitting: boolean;
  submitError: string | null;
  bookingResult: BookResponse | null;
  // Top-level message
  message: string | null;
}

type WizardAction =
  | { type: 'PRACTITIONER_LOADING' }
  | { type: 'PRACTITIONER_LOADED'; practitioner: PublicPractitioner; sessionTypes: SessionType[] }
  | { type: 'PRACTITIONER_ERROR'; message: string }
  | { type: 'SELECT_SESSION_TYPE'; sessionType: SessionType }
  | { type: 'SELECT_DATE'; date: Date; dateStr: string }
  | { type: 'SLOTS_LOADING' }
  | { type: 'SLOTS_LOADED'; slots: Slot[]; state: SlotState }
  | { type: 'SELECT_SLOT'; slot: Slot }
  | { type: 'UPDATE_GUEST_DETAILS'; details: GuestDetails }
  | { type: 'SUBMIT_DETAILS'; details: GuestDetails }
  | { type: 'SUBMIT_START' }
  | { type: 'SUBMIT_SUCCESS'; result: BookResponse }
  | { type: 'SUBMIT_ERROR'; message: string }
  | { type: 'SLOT_TAKEN' }
  | { type: 'SESSION_TYPE_NOT_FOUND'; message: string }
  | { type: 'GO_BACK' }
  | { type: 'CLEAR_SUBMIT_ERROR' };

// ─── Initial state ────────────────────────────────────────────────────────────

function makeInitialState(timezone: string): WizardState {
  return {
    step: 'session-type',
    practitioner: null,
    practitionerLoading: true,
    practitionerError: null,
    sessionTypes: [],
    selectedSessionType: null,
    selectedDate: null,
    selectedDateStr: null,
    slots: [],
    slotState: 'no_availability',
    slotLoading: false,
    selectedSlot: null,
    guestDetails: {
      guestName: '',
      guestEmail: '',
      timezone,
      notes: '',
    },
    submitting: false,
    submitError: null,
    bookingResult: null,
    message: null,
  };
}

// ─── Reducer ──────────────────────────────────────────────────────────────────

function prevStep(step: WizardStep): WizardStep {
  const idx = WIZARD_STEPS.indexOf(step);
  return idx > 0 ? WIZARD_STEPS[idx - 1]! : WIZARD_STEPS[0]!;
}

function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'PRACTITIONER_LOADING':
      return { ...state, practitionerLoading: true, practitionerError: null };

    case 'PRACTITIONER_LOADED':
      return {
        ...state,
        practitionerLoading: false,
        practitioner: action.practitioner,
        sessionTypes: action.sessionTypes,
        practitionerError: null,
      };

    case 'PRACTITIONER_ERROR':
      return {
        ...state,
        practitionerLoading: false,
        practitionerError: action.message,
      };

    case 'SELECT_SESSION_TYPE':
      return {
        ...state,
        selectedSessionType: action.sessionType,
        step: 'date',
        // Reset downstream selections
        selectedDate: null,
        selectedDateStr: null,
        slots: [],
        selectedSlot: null,
        slotState: 'no_availability',
        message: null,
      };

    case 'SELECT_DATE':
      return {
        ...state,
        selectedDate: action.date,
        selectedDateStr: action.dateStr,
        step: 'time',
        slots: [],
        selectedSlot: null,
        slotState: 'no_availability',
      };

    case 'SLOTS_LOADING':
      return { ...state, slotLoading: true, slots: [], slotState: 'no_availability' };

    case 'SLOTS_LOADED':
      return {
        ...state,
        slotLoading: false,
        slots: action.slots,
        slotState: action.state,
      };

    case 'SELECT_SLOT':
      return {
        ...state,
        selectedSlot: action.slot,
        step: 'details',
      };

    case 'UPDATE_GUEST_DETAILS':
      return { ...state, guestDetails: action.details };

    case 'SUBMIT_DETAILS':
      return { ...state, guestDetails: action.details, step: 'confirmation' };

    case 'SUBMIT_START':
      return { ...state, submitting: true, submitError: null };

    case 'SUBMIT_SUCCESS':
      return { ...state, submitting: false, bookingResult: action.result };

    case 'SUBMIT_ERROR':
      return { ...state, submitting: false, submitError: action.message };

    case 'SLOT_TAKEN':
      return {
        ...state,
        submitting: false,
        step: 'time',
        selectedSlot: null,
        submitError: null,
        message: 'That slot is no longer available. Please choose another time.',
      };

    case 'SESSION_TYPE_NOT_FOUND':
      return {
        ...state,
        submitting: false,
        step: 'session-type',
        selectedSessionType: null,
        selectedDate: null,
        selectedDateStr: null,
        selectedSlot: null,
        message: action.message,
      };

    case 'GO_BACK': {
      if (state.step === 'session-type') return state;
      const prev = prevStep(state.step);
      return { ...state, step: prev, submitError: null };
    }

    case 'CLEAR_SUBMIT_ERROR':
      return { ...state, submitError: null };

    default:
      return state;
  }
}

// ─── Turnstile ────────────────────────────────────────────────────────────────

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          'expired-callback': () => void;
          'error-callback': () => void;
        }
      ) => string;
      reset: (widgetId: string) => void;
    };
  }
}

function TurnstileWidget({ onToken }: { onToken: (token: string | null) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    const siteKey = (import.meta.env as Record<string, string>)['VITE_TURNSTILE_SITE_KEY'];
    if (!siteKey || !containerRef.current) return;

    const initWidget = () => {
      if (!containerRef.current || !window.turnstile) return;
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        callback: (token: string) => onToken(token),
        'expired-callback': () => onToken(null),
        'error-callback': () => onToken(null),
      });
    };

    if (window.turnstile) {
      initWidget();
    } else {
      // Load script if not present
      const existing = document.getElementById('turnstile-script');
      if (!existing) {
        const script = document.createElement('script');
        script.id = 'turnstile-script';
        script.src =
          'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        script.async = true;
        script.onload = initWidget;
        document.head.appendChild(script);
      } else {
        // Script already loading; poll for readiness
        const interval = setInterval(() => {
          if (window.turnstile) {
            clearInterval(interval);
            initWidget();
          }
        }, 100);
        return () => clearInterval(interval);
      }
    }
  }, [onToken]);

  return (
    <div
      ref={containerRef}
      className="flex justify-center my-4"
      aria-label="Security challenge"
    />
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDateToISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function BookingPage() {
  const { username } = useParams<{ username: string }>();
  const [searchParams] = useSearchParams();
  const sessionParam = searchParams.get('session');

  const { timezone, setTimezone, isDetected, timezoneList } = useTimezone();

  const [state, dispatch] = useReducer(
    wizardReducer,
    timezone,
    makeInitialState
  );

  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  const turnstileTokenRef = useRef<string | null>(null);

  // Move focus to heading when step changes
  useEffect(() => {
    stepHeadingRef.current?.focus();
  }, [state.step]);

  // ── Load practitioner & session types ─────────────────────────────────────
  useEffect(() => {
    if (!username) return;

    let cancelled = false;
    dispatch({ type: 'PRACTITIONER_LOADING' });

    (async () => {
      try {
        // Fetch practitioner from public view
        const { data: practitioner, error: pErr } = await supabase
          .from('public_practitioners')
          .select('*')
          .eq('username', username)
          .single();

        if (cancelled) return;

        if (pErr || !practitioner) {
          dispatch({
            type: 'PRACTITIONER_ERROR',
            message: 'This practitioner was not found.',
          });
          return;
        }

        // Fetch active session types
        const { data: sessionTypes, error: stErr } = await supabase
          .from('session_types')
          .select('*')
          .eq('practitioner_id', practitioner.id)
          .eq('is_active', true)
          .order('sort_order', { ascending: true });

        if (cancelled) return;

        if (stErr) {
          dispatch({
            type: 'PRACTITIONER_ERROR',
            message: 'Failed to load session types. Please try again.',
          });
          return;
        }

        dispatch({
          type: 'PRACTITIONER_LOADED',
          practitioner: practitioner as PublicPractitioner,
          sessionTypes: (sessionTypes ?? []) as SessionType[],
        });
      } catch {
        if (!cancelled) {
          dispatch({
            type: 'PRACTITIONER_ERROR',
            message: 'Something went wrong. Please try again.',
          });
        }
      }
    })();

    return () => { cancelled = true; };
  }, [username]);

  // ── Auto-skip step 1 ──────────────────────────────────────────────────────
  useEffect(() => {
    if (state.practitionerLoading || !state.practitioner) return;
    if (state.step !== 'session-type') return;
    if (state.selectedSessionType) return;

    const types = state.sessionTypes;

    // Pre-select via ?session= query param
    if (sessionParam) {
      const found = types.find((t) => t.id === sessionParam);
      if (found) {
        dispatch({ type: 'SELECT_SESSION_TYPE', sessionType: found });
        return;
      }
    }

    // Auto-skip if exactly one active session type
    if (types.length === 1 && types[0]) {
      dispatch({ type: 'SELECT_SESSION_TYPE', sessionType: types[0] });
    }
  }, [
    state.practitionerLoading,
    state.practitioner,
    state.step,
    state.selectedSessionType,
    state.sessionTypes,
    sessionParam,
  ]);

  // ── Fetch slots when step is time ─────────────────────────────────────────
  useEffect(() => {
    if (state.step !== 'time') return;
    if (!state.selectedSessionType || !state.selectedDateStr || !username) return;

    let cancelled = false;
    dispatch({ type: 'SLOTS_LOADING' });

    const params = new URLSearchParams({
      username,
      session_type_id: state.selectedSessionType.id,
      date: state.selectedDateStr,
      timezone,
    });

    fetch(`/api/slots?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.error) {
          dispatch({ type: 'SLOTS_LOADED', slots: [], state: 'no_availability' });
        } else {
          dispatch({
            type: 'SLOTS_LOADED',
            slots: (data.slots ?? []) as Slot[],
            state: (data.state ?? 'no_availability') as SlotState,
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          dispatch({ type: 'SLOTS_LOADED', slots: [], state: 'no_availability' });
        }
      });

    return () => { cancelled = true; };
  }, [state.step, state.selectedSessionType, state.selectedDateStr, username, timezone]);

  // ── Booking submission ────────────────────────────────────────────────────
  const handleSubmitBooking = useCallback(async () => {
    if (
      !state.selectedSessionType ||
      !state.selectedSlot ||
      !state.practitioner ||
      !username
    ) return;

    const token = turnstileTokenRef.current;
    if (!token) {
      dispatch({ type: 'SUBMIT_ERROR', message: 'Please complete the security challenge.' });
      return;
    }

    dispatch({ type: 'SUBMIT_START' });

    try {
      const res = await fetch('/api/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          session_type_id: state.selectedSessionType.id,
          starts_at: state.selectedSlot.starts_at,
          guest_name: state.guestDetails.guestName,
          guest_email: state.guestDetails.guestEmail,
          guest_timezone: state.guestDetails.timezone,
          notes: state.guestDetails.notes || undefined,
          turnstile_token: token,
        }),
      });

      const data = (await res.json()) as { error?: { code: string; message: string } } & Partial<BookResponse>;

      if (!res.ok) {
        if (data.error?.code === 'SLOT_TAKEN') {
          dispatch({ type: 'SLOT_TAKEN' });
        } else if (data.error?.code === 'NOT_FOUND') {
          dispatch({
            type: 'SESSION_TYPE_NOT_FOUND',
            message: data.error.message ?? 'Session type not found. Please start over.',
          });
        } else {
          dispatch({
            type: 'SUBMIT_ERROR',
            message: data.error?.message ?? 'Something went wrong. Please try again.',
          });
        }
        return;
      }

      if (data.booking_token && data.booking_url && data.starts_at && data.ends_at) {
        dispatch({ type: 'SUBMIT_SUCCESS', result: data as BookResponse });
      }
    } catch {
      dispatch({ type: 'SUBMIT_ERROR', message: 'Network error. Please try again.' });
    }
  }, [state, username]);

  // ─── Compute date constraints ─────────────────────────────────────────────
  const { minDate, maxDate } = (() => {
    const st = state.selectedSessionType;
    const now = new Date();
    const min = new Date(now.getTime() + (st?.min_notice_hours ?? 2) * 60 * 60 * 1000);
    min.setHours(0, 0, 0, 0);
    const max = new Date();
    max.setDate(max.getDate() + (st?.max_advance_days ?? 30));
    max.setHours(23, 59, 59, 999);
    return { minDate: min, maxDate: max };
  })();

  // ─── Render ───────────────────────────────────────────────────────────────

  if (!username) {
    return (
      <PageShell>
        <EmptyState title="Invalid booking link" description="No practitioner specified." />
      </PageShell>
    );
  }

  if (state.practitionerLoading) {
    return (
      <PageShell>
        <div className="flex items-center justify-center py-16" role="status" aria-label="Loading">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      </PageShell>
    );
  }

  if (state.practitionerError) {
    return (
      <PageShell>
        <EmptyState title="Not found" description={state.practitionerError} icon="🔍" />
      </PageShell>
    );
  }

  if (!state.practitioner) {
    return (
      <PageShell>
        <EmptyState title="Not found" description="This practitioner was not found." icon="🔍" />
      </PageShell>
    );
  }

  if (!state.practitioner.is_active) {
    return (
      <PageShell>
        <PractitionerHeader practitioner={state.practitioner} />
        <EmptyState
          title="Not accepting bookings"
          description="This practitioner is not currently accepting bookings."
          icon="🚫"
        />
      </PageShell>
    );
  }

  // If booking is complete, show success screen
  if (state.bookingResult) {
    return (
      <PageShell>
        <PractitionerHeader practitioner={state.practitioner} />
        <BookingSuccess
          result={state.bookingResult}
          practitionerUsername={username}
        />
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PractitionerHeader practitioner={state.practitioner} />
      <WizardProgress currentStep={state.step} />

      {state.message && (
        <div
          className="mb-4 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800"
          role="alert"
        >
          {state.message}
        </div>
      )}

      {/* ── Step 1: Session Type ─────────────────────────────────────── */}
      {state.step === 'session-type' && (
        <StepSection
          heading="What type of session?"
          headingRef={stepHeadingRef}

        >
          {state.sessionTypes.length === 0 ? (
            <EmptyState
              title="No sessions available"
              description="No session types are currently available."
            />
          ) : (
            <div className="space-y-3">
              {state.sessionTypes.map((st) => (
                <SessionTypeCard
                  key={st.id}
                  sessionType={st}
                  selected={state.selectedSessionType?.id === st.id}
                  onSelect={(s) => dispatch({ type: 'SELECT_SESSION_TYPE', sessionType: s })}
                />
              ))}
            </div>
          )}
        </StepSection>
      )}

      {/* ── Step 2: Date ─────────────────────────────────────────────── */}
      {state.step === 'date' && state.selectedSessionType && (
        <StepSection
          heading="Pick a date"
          headingRef={stepHeadingRef}

          onBack={() => dispatch({ type: 'GO_BACK' })}
        >
          <div className="flex justify-center">
            <DayPicker
              mode="single"
              selected={state.selectedDate ?? undefined}
              onSelect={(date) => {
                if (!date) return;
                dispatch({
                  type: 'SELECT_DATE',
                  date,
                  dateStr: formatDateToISO(date),
                });
              }}
              disabled={[{ before: minDate }, { after: maxDate }]}
              fromMonth={minDate}
              toMonth={maxDate}
              className="border border-gray-200 rounded-xl p-2"
            />
          </div>
        </StepSection>
      )}

      {/* ── Step 3: Time ─────────────────────────────────────────────── */}
      {state.step === 'time' && state.selectedDateStr && (
        <StepSection
          heading="Choose a time"
          headingRef={stepHeadingRef}

          onBack={() => dispatch({ type: 'GO_BACK' })}
        >
          <p className="text-sm text-gray-500 mb-4">
            {formatDisplayDate(state.selectedDateStr)}
          </p>
          <TimeSlotGrid
            slots={state.slots}
            state={state.slotState}
            selectedSlot={state.selectedSlot}
            timezone={timezone}
            loading={state.slotLoading}
            onSelect={(slot) => {
              dispatch({ type: 'SELECT_SLOT', slot });
            }}
          />
        </StepSection>
      )}

      {/* ── Step 4: Details ──────────────────────────────────────────── */}
      {state.step === 'details' && (
        <StepSection
          heading="Your details"
          headingRef={stepHeadingRef}
        >
          <GuestDetailsForm
            initialValues={{ ...state.guestDetails, timezone }}
            timezoneList={timezoneList}
            isDetectedTimezone={isDetected}
            onChange={(details) => {
              setTimezone(details.timezone);
              dispatch({ type: 'UPDATE_GUEST_DETAILS', details });
            }}
            onSubmit={(details) => {
              dispatch({ type: 'SUBMIT_DETAILS', details });
            }}
            onBack={() => dispatch({ type: 'GO_BACK' })}
          />
        </StepSection>
      )}

      {/* ── Step 5: Confirmation ─────────────────────────────────────── */}
      {state.step === 'confirmation' &&
        state.selectedSessionType &&
        state.selectedSlot &&
        state.practitioner && (
          <StepSection
            heading="Confirm your booking"
            headingRef={stepHeadingRef}
  
            onBack={() => dispatch({ type: 'GO_BACK' })}
          >
            <BookingSummary
              sessionType={state.selectedSessionType}
              selectedSlot={state.selectedSlot}
              guestDetails={state.guestDetails}
              practitionerDisplayName={state.practitioner.display_name}
            />

            <div className="mt-6">
              <TurnstileWidget
                onToken={(t) => { turnstileTokenRef.current = t; }}
              />
            </div>

            {state.submitError && (
              <div
                className="mb-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700"
                role="alert"
              >
                {state.submitError}
              </div>
            )}

            <button
              type="button"
              onClick={handleSubmitBooking}
              disabled={state.submitting}
              className="w-full min-h-[44px] px-4 py-3 rounded-lg bg-accent text-white font-semibold text-sm hover:opacity-90 transition-opacity focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {state.submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Confirming…
                </span>
              ) : (
                'Confirm Booking'
              )}
            </button>
          </StepSection>
        )}
    </PageShell>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-lg mx-auto px-4 py-8 sm:py-12">
        {children}
      </div>
    </div>
  );
}

function PractitionerHeader({ practitioner }: { practitioner: PublicPractitioner }) {
  return (
    <div className="flex items-center gap-4 mb-6">
      {practitioner.photo_url ? (
        <img
          src={practitioner.photo_url}
          alt={practitioner.display_name}
          className="w-14 h-14 rounded-full object-cover shrink-0 border border-gray-200"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = 'none';
          }}
        />
      ) : (
        <div
          className="w-14 h-14 rounded-full bg-gray-200 flex items-center justify-center text-xl font-bold text-gray-500 shrink-0"
          aria-hidden="true"
        >
          {practitioner.display_name.charAt(0).toUpperCase()}
        </div>
      )}
      <div>
        <h1 className="text-xl font-bold text-gray-900">{practitioner.display_name}</h1>
        {practitioner.bio && (
          <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">{practitioner.bio}</p>
        )}
      </div>
    </div>
  );
}

interface StepSectionProps {
  heading: string;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  children: React.ReactNode;
  onBack?: () => void;
}

function StepSection({ heading, headingRef, children, onBack }: StepSectionProps) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 sm:p-6">
      <h2
        ref={headingRef}
        tabIndex={-1}
        className="text-lg font-bold text-gray-900 mb-5 focus:outline-none"
      >
        {heading}
      </h2>
      {children}
      {onBack && (
        <div className="mt-5 pt-4 border-t border-gray-100">
          <button
            type="button"
            onClick={onBack}
            className="min-h-[44px] px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            ← Back
          </button>
        </div>
      )}
    </div>
  );
}

function BookingSuccess({
  result,
  practitionerUsername,
}: {
  result: BookResponse;
  practitionerUsername: string;
}) {
  const bookingUrl = `/booking/${result.booking_token}`;
  const icsUrl = `/api/booking/${result.booking_token}/ics`;
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 text-center">
      <div className="text-5xl mb-4" aria-hidden="true">✅</div>
      <h2 className="text-xl font-bold text-gray-900 mb-2">Booking confirmed!</h2>
      <p className="text-sm text-gray-500 mb-6">
        A confirmation email has been sent. You can manage your booking at:
      </p>
      <a
        href={bookingUrl}
        className="block mb-3 text-accent text-sm font-medium break-all hover:underline"
      >
        {window.location.origin}{bookingUrl}
      </a>
      <div className="flex flex-col sm:flex-row gap-3 justify-center mt-6">
        <a
          href={icsUrl}
          download="booking.ics"
          className="min-h-[44px] flex items-center justify-center px-5 py-2.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          📅 Add to Calendar
        </a>
        <a
          href={`/book/${practitionerUsername}`}
          className="min-h-[44px] flex items-center justify-center px-5 py-2.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Book another session
        </a>
      </div>
    </div>
  );
}

function formatDisplayDate(dateStr: string): string {
  try {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y!, (m! - 1), d!);
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(date);
  } catch {
    return dateStr;
  }
}
