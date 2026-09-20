"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type MouseEvent } from "react";
import { Check, X } from "lucide-react";
import type { Market } from "@/lib/market";
import { MARKET_CONFIG } from "@/lib/market";
import styles from "./product-detail.module.css";

type AssistedPurchaseModalProps = {
  isOpen: boolean;
  onClose: () => void;
  productId: string;
  offerId: string;
  variantId: string | null;
  productName: string;
  variantLabel: string | null;
  displayedPrice: number;
  currency: string;
  market: Market;
};

type FormValues = {
  customerName: string;
  phone: string;
  email: string;
  consent: boolean;
};

type FieldErrors = Partial<Record<keyof FormValues, string>>;

const initialValues: FormValues = {
  customerName: "",
  phone: "",
  email: "",
  consent: false,
};

export function AssistedPurchaseModal({
  isOpen,
  onClose,
  productId,
  offerId,
  variantId,
  productName,
  variantLabel,
  displayedPrice,
  currency,
  market,
}: AssistedPurchaseModalProps) {
  const titleId = useId();
  const descriptionId = useId();
  const formErrorId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);
  const successButtonRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  const submissionKeyRef = useRef<string | null>(null);
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [requestError, setRequestError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;

    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const scrollY = window.scrollY;
    const previousBodyStyles = {
      overflow: document.body.style.overflow,
      position: document.body.style.position,
      top: document.body.style.top,
      width: document.body.style.width,
    };

    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";

    const focusFrame = window.requestAnimationFrame(() => {
      firstInputRef.current?.focus();
    });

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;

      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ));
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousBodyStyles.overflow;
      document.body.style.position = previousBodyStyles.position;
      document.body.style.top = previousBodyStyles.top;
      document.body.style.width = previousBodyStyles.width;
      window.scrollTo({ top: scrollY, behavior: "instant" });
      previousFocus?.focus();
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && isSuccess) successButtonRef.current?.focus();
  }, [isOpen, isSuccess]);

  if (!isOpen) return null;

  return (
    <div className={styles.assistedModalBackdrop} onMouseDown={handleBackdropMouseDown}>
      <div
        ref={dialogRef}
        className={styles.assistedModal}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <button
          className={styles.assistedModalClose}
          type="button"
          aria-label="Fechar solicitação de atendimento"
          onClick={onClose}
        >
          <X size={20} aria-hidden="true" />
        </button>

        {isSuccess ? (
          <div className={styles.assistedModalSuccess}>
            <span className={styles.assistedSuccessIcon}><Check size={24} aria-hidden="true" /></span>
            <p className={styles.assistedModalKicker}>Solicitação enviada</p>
            <h2 id={titleId}>Recebemos sua solicitação.</h2>
            <p id={descriptionId}>Nossa equipe entrará em contato pelo WhatsApp ou e-mail informado.</p>
            <button ref={successButtonRef} className={styles.assistedSubmitButton} type="button" onClick={onClose}>
              Fechar
            </button>
          </div>
        ) : (
          <>
            <div className={styles.assistedModalHeading}>
              <p className={styles.assistedModalKicker}>Compra assistida NOMA</p>
              <h2 id={titleId}>Solicitar atendimento de compra</h2>
              <p id={descriptionId}>Deixe seus dados para que nossa equipe acompanhe esta compra pessoalmente.</p>
            </div>

            <div className={styles.assistedProductSummary} aria-label="Resumo do produto">
              <div>
                <strong>{productName}</strong>
                {variantLabel && <span>{variantLabel}</span>}
              </div>
              <b>{formatMoney(displayedPrice, currency, market)}</b>
            </div>

            <form className={styles.assistedForm} noValidate onSubmit={handleSubmit}>
              <div className={styles.assistedField}>
                <label htmlFor={`${titleId}-name`}>Nome completo</label>
                <input
                  ref={firstInputRef}
                  id={`${titleId}-name`}
                  name="customerName"
                  type="text"
                  autoComplete="name"
                  required
                  value={values.customerName}
                  aria-invalid={Boolean(errors.customerName)}
                  aria-describedby={errors.customerName ? `${titleId}-name-error` : undefined}
                  onChange={(event) => updateField("customerName", event.target.value)}
                />
                {errors.customerName && <p id={`${titleId}-name-error`} className={styles.assistedFieldError}>{errors.customerName}</p>}
              </div>

              <div className={styles.assistedField}>
                <label htmlFor={`${titleId}-phone`}>WhatsApp / telefone</label>
                <input
                  id={`${titleId}-phone`}
                  name="phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  required
                  value={values.phone}
                  aria-invalid={Boolean(errors.phone)}
                  aria-describedby={errors.phone ? `${titleId}-phone-error` : undefined}
                  onChange={(event) => updateField("phone", event.target.value)}
                />
                {errors.phone && <p id={`${titleId}-phone-error`} className={styles.assistedFieldError}>{errors.phone}</p>}
              </div>

              <div className={styles.assistedField}>
                <label htmlFor={`${titleId}-email`}>E-mail <span>(opcional)</span></label>
                <input
                  id={`${titleId}-email`}
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={values.email}
                  aria-invalid={Boolean(errors.email)}
                  aria-describedby={errors.email ? `${titleId}-email-error` : undefined}
                  onChange={(event) => updateField("email", event.target.value)}
                />
                {errors.email && <p id={`${titleId}-email-error`} className={styles.assistedFieldError}>{errors.email}</p>}
              </div>

              <div className={styles.assistedConsentField}>
                <label htmlFor={`${titleId}-consent`}>
                  <input
                    id={`${titleId}-consent`}
                    name="consent"
                    type="checkbox"
                    required
                    checked={values.consent}
                    aria-invalid={Boolean(errors.consent)}
                    aria-describedby={errors.consent ? `${titleId}-consent-error` : undefined}
                    onChange={(event) => updateField("consent", event.target.checked)}
                  />
                  <span>Aceito ser contatado pela NOMA sobre esta compra.</span>
                </label>
                {errors.consent && <p id={`${titleId}-consent-error`} className={styles.assistedFieldError}>{errors.consent}</p>}
              </div>

              {requestError && <p id={formErrorId} className={styles.assistedRequestError} role="alert">{requestError}</p>}

              <button
                className={styles.assistedSubmitButton}
                type="submit"
                disabled={isSubmitting}
                aria-describedby={requestError ? formErrorId : undefined}
              >
                {isSubmitting ? "Enviando solicitação..." : "Solicitar atendimento"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );

  function handleBackdropMouseDown(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) onClose();
  }

  function updateField<Key extends keyof FormValues>(field: Key, value: FormValues[Key]) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setRequestError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    const nextErrors = validateForm(values);
    setErrors(nextErrors);
    setRequestError(null);
    if (Object.keys(nextErrors).length > 0) return;

    setIsSubmitting(true);
    submissionKeyRef.current = submissionKeyRef.current ?? createSubmissionKey();
    try {
      const response = await fetch("/api/assisted-purchase", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": submissionKeyRef.current,
        },
        credentials: "same-origin",
        body: JSON.stringify({
          productId,
          offerId,
          variantId,
          customerName: values.customerName,
          phone: values.phone,
          email: values.email || undefined,
          consent: values.consent,
        }),
      });
      const payload = await response.json().catch(() => null) as AssistedPurchaseResponse | null;
      if (response.ok && payload?.type === "success") {
        setIsSuccess(true);
        return;
      }
      setRequestError(payload?.type === "error" ? payload.message : "Não foi possível enviar sua solicitação agora. Tente novamente.");
    } catch {
      setRequestError("Não foi possível enviar sua solicitação agora. Tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  }
}

type AssistedPurchaseResponse =
  | { type: "success" }
  | { type: "error"; error: string; message: string };

function validateForm(values: FormValues): FieldErrors {
  const errors: FieldErrors = {};
  if (!values.customerName.trim()) errors.customerName = "Informe seu nome completo.";

  const phone = values.phone.trim();
  const phoneDigits = phone.replace(/\D/g, "");
  if (!phone) {
    errors.phone = "Informe seu WhatsApp ou telefone.";
  } else if (!/^[+()\-\s.\d]+$/.test(phone) || phoneDigits.length < 8 || phoneDigits.length > 15) {
    errors.phone = "Informe um telefone válido com DDD.";
  }

  const email = values.email.trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = "Informe um e-mail válido.";
  }
  if (!values.consent) errors.consent = "O consentimento é necessário para solicitar contato.";
  return errors;
}

function createSubmissionKey() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function formatMoney(value: number, currency: string, market: Market) {
  return new Intl.NumberFormat(MARKET_CONFIG[market].locale, { style: "currency", currency }).format(value);
}
