"use client";

import { useActionState } from "react";
import { LoaderCircle, LogIn } from "lucide-react";
import { loginAction, type LoginState } from "@/app/admin/actions";

const initialState: LoginState = {};

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, initialState);
  return (
    <form action={action} className="mt-7 space-y-4">
      <label className="admin-field">E-mail<input name="email" type="email" autoComplete="username" required /></label>
      <label className="admin-field">Senha<input name="password" type="password" autoComplete="current-password" required /></label>
      {state.error && <p role="alert" className="rounded-sm bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{state.error}</p>}
      <button className="button-primary w-full" disabled={pending}>
        {pending ? <LoaderCircle className="animate-spin" size={17} /> : <LogIn size={17} />} Entrar
      </button>
    </form>
  );
}
