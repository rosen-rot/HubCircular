"use client";

import { Alert } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function PrivateError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="space-y-4" role="alert">
      <Alert tone="error">No pudimos cargar esta página. Intente nuevamente; si el problema persiste, avise a un administrador.</Alert>
      <Button onClick={reset}>Reintentar</Button>
    </div>
  );
}
