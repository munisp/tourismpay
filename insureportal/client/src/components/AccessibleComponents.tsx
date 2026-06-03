/**
 * AccessibleComponents — Reusable accessible UI primitives
 *
 * WCAG 2.1 AA compliant components providing:
 * - Proper ARIA landmarks, labels, and roles
 * - Keyboard navigation support
 * - Focus management
 * - Screen reader announcements
 */
import { type ReactNode, type HTMLAttributes, forwardRef } from "react";

// ── Landmark Components ──

interface MainContentProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode;
}

export const MainContent = forwardRef<HTMLElement, MainContentProps>(
  ({ children, ...props }, ref) => (
    <main
      ref={ref}
      id="main-content"
      role="main"
      aria-label="Main content"
      tabIndex={-1}
      {...props}
    >
      {children}
    </main>
  )
);
MainContent.displayName = "MainContent";

interface NavigationProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode;
  label: string;
}

export const Navigation = forwardRef<HTMLElement, NavigationProps>(
  ({ children, label, ...props }, ref) => (
    <nav ref={ref} role="navigation" aria-label={label} {...props}>
      {children}
    </nav>
  )
);
Navigation.displayName = "Navigation";

interface SidebarProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode;
  expanded?: boolean;
}

export const Sidebar = forwardRef<HTMLElement, SidebarProps>(
  ({ children, expanded = true, ...props }, ref) => (
    <aside
      ref={ref}
      role="complementary"
      aria-label="Sidebar navigation"
      aria-expanded={expanded}
      {...props}
    >
      {children}
    </aside>
  )
);
Sidebar.displayName = "Sidebar";

// ── Data Display Components ──

interface DataTableProps extends HTMLAttributes<HTMLTableElement> {
  children: ReactNode;
  caption: string;
  sortable?: boolean;
}

export const DataTable = forwardRef<HTMLTableElement, DataTableProps>(
  ({ children, caption, sortable, ...props }, ref) => (
    <table
      ref={ref}
      role="grid"
      aria-label={caption}
      aria-readonly={!sortable}
      {...props}
    >
      <caption className="sr-only">{caption}</caption>
      {children}
    </table>
  )
);
DataTable.displayName = "DataTable";

interface SortableHeaderProps extends HTMLAttributes<HTMLTableCellElement> {
  children: ReactNode;
  sorted?: "ascending" | "descending" | "none";
  onSort?: () => void;
}

export const SortableHeader = forwardRef<
  HTMLTableCellElement,
  SortableHeaderProps
>(({ children, sorted = "none", onSort, ...props }, ref) => (
  <th
    ref={ref}
    role="columnheader"
    aria-sort={sorted}
    tabIndex={0}
    onKeyDown={(e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onSort?.();
      }
    }}
    onClick={onSort}
    {...props}
  >
    {children}
    {sorted !== "none" && (
      <span aria-hidden="true">{sorted === "ascending" ? " ↑" : " ↓"}</span>
    )}
  </th>
));
SortableHeader.displayName = "SortableHeader";

// ── Form Components ──

interface FormFieldProps {
  id: string;
  label: string;
  error?: string;
  required?: boolean;
  helpText?: string;
  children: ReactNode;
}

export function FormField({
  id,
  label,
  error,
  required,
  helpText,
  children,
}: FormFieldProps) {
  const errorId = `${id}-error`;
  const helpId = `${id}-help`;

  return (
    <div role="group" aria-labelledby={`${id}-label`}>
      <label id={`${id}-label`} htmlFor={id}>
        {label}
        {required && (
          <span aria-label="required" className="text-red-500 ml-1">
            *
          </span>
        )}
      </label>
      {helpText && (
        <p id={helpId} className="text-sm text-muted-foreground">
          {helpText}
        </p>
      )}
      <div
        aria-describedby={[helpText ? helpId : "", error ? errorId : ""]
          .filter(Boolean)
          .join(" ")}
        aria-invalid={!!error}
      >
        {children}
      </div>
      {error && (
        <p id={errorId} role="alert" className="text-sm text-red-500 mt-1">
          {error}
        </p>
      )}
    </div>
  );
}

// ── Status & Feedback ──

interface StatusBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  status: "success" | "warning" | "error" | "info" | "pending";
  children: ReactNode;
}

export function StatusBadge({ status, children, ...props }: StatusBadgeProps) {
  const statusLabels = {
    success: "Status: successful",
    warning: "Status: warning",
    error: "Status: error",
    info: "Status: information",
    pending: "Status: pending",
  };

  return (
    <span role="status" aria-label={statusLabels[status]} {...props}>
      {children}
    </span>
  );
}

interface LoadingSpinnerProps {
  label?: string;
  size?: "sm" | "md" | "lg";
}

export function LoadingSpinner({
  label = "Loading...",
  size = "md",
}: LoadingSpinnerProps) {
  const sizes = { sm: "w-4 h-4", md: "w-8 h-8", lg: "w-12 h-12" };
  return (
    <div role="status" aria-label={label} aria-busy="true">
      <div
        className={`${sizes[size]} animate-spin rounded-full border-2 border-current border-t-transparent`}
        aria-hidden="true"
      />
      <span className="sr-only">{label}</span>
    </div>
  );
}

// ── Dialog / Modal ──

interface ModalProps extends HTMLAttributes<HTMLDivElement> {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export function Modal({ open, title, onClose, children, ...props }: ModalProps) {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
      {...props}
    >
      <h2 id="modal-title" className="sr-only">
        {title}
      </h2>
      {children}
    </div>
  );
}

// ── Notification / Alert ──

interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  severity: "info" | "success" | "warning" | "error";
  children: ReactNode;
  dismissible?: boolean;
  onDismiss?: () => void;
}

export function Alert({
  severity,
  children,
  dismissible,
  onDismiss,
  ...props
}: AlertProps) {
  return (
    <div
      role="alert"
      aria-live={severity === "error" ? "assertive" : "polite"}
      aria-atomic="true"
      {...props}
    >
      {children}
      {dismissible && (
        <button
          aria-label="Dismiss alert"
          onClick={onDismiss}
          type="button"
        >
          ×
        </button>
      )}
    </div>
  );
}

// ── Tabs ──

interface TabListProps extends HTMLAttributes<HTMLDivElement> {
  label: string;
  children: ReactNode;
}

export function TabList({ label, children, ...props }: TabListProps) {
  return (
    <div role="tablist" aria-label={label} {...props}>
      {children}
    </div>
  );
}

interface TabProps extends HTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
  controls: string;
  children: ReactNode;
}

export function Tab({ selected, controls, children, ...props }: TabProps) {
  return (
    <button
      role="tab"
      aria-selected={selected}
      aria-controls={controls}
      tabIndex={selected ? 0 : -1}
      type="button"
      {...props}
    >
      {children}
    </button>
  );
}

interface TabPanelProps extends HTMLAttributes<HTMLDivElement> {
  id: string;
  labelledBy: string;
  children: ReactNode;
}

export function TabPanel({ id, labelledBy, children, ...props }: TabPanelProps) {
  return (
    <div
      id={id}
      role="tabpanel"
      aria-labelledby={labelledBy}
      tabIndex={0}
      {...props}
    >
      {children}
    </div>
  );
}
