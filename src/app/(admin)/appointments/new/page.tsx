import { Suspense } from "react";
import NewAppointmentForm from "./NewAppointmentForm";

export default function NewAppointmentPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-24">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-brand-500" />
        </div>
      }
    >
      <NewAppointmentForm />
    </Suspense>
  );
}
